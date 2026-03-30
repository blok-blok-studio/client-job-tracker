/**
 * Flow Execution Engine
 * Processes automation flows node by node, handling messages, conditions,
 * AI responses, delays, and branching logic.
 */

import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { sendInstagramDM, sendFacebookMessage, buildQuickReplies } from "./messenger";
import { generateAIResponse } from "./ai-responder";
import { sendTelegramMessage } from "@/lib/telegram";

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

interface ExecutionContext {
  variables: Record<string, string>;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  tags: string[];
  lastMessage: string;
  lastQuickReplyPayload?: string;
}

/** Start a new flow execution for an incoming message */
export async function startExecution(
  flowId: string,
  contactId: string,
  contactName: string,
  incomingMessage: string,
  quickReplyPayload?: string
): Promise<void> {
  const flow = await prisma.automationFlow.findUnique({ where: { id: flowId } });
  if (!flow || !flow.active) return;

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];

  // Find trigger node (entry point)
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) return;

  // Create execution record
  const execution = await prisma.automationExecution.create({
    data: {
      flowId,
      contactId,
      contactName,
      status: "RUNNING",
      context: {
        variables: { contactName, contactId },
        conversationHistory: [],
        tags: [],
        lastMessage: incomingMessage,
        lastQuickReplyPayload: quickReplyPayload,
      },
    },
  });

  // Log inbound message
  await prisma.automationMessage.create({
    data: {
      executionId: execution.id,
      direction: "INBOUND",
      text: incomingMessage,
      nodeId: triggerNode.id,
    },
  });

  // Find first node after trigger
  const firstEdge = edges.find((e) => e.source === triggerNode.id);
  if (!firstEdge) {
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return;
  }

  const firstNode = nodes.find((n) => n.id === firstEdge.target);
  if (!firstNode) return;

  await processNode(execution.id, firstNode, nodes, edges, flow);
}

/** Resume a paused execution when user replies */
export async function resumeExecution(
  executionId: string,
  incomingMessage: string,
  quickReplyPayload?: string
): Promise<void> {
  const execution = await prisma.automationExecution.findUnique({ where: { id: executionId } });
  if (!execution || execution.status !== "PAUSED") return;

  const flow = await prisma.automationFlow.findUnique({ where: { id: execution.flowId } });
  if (!flow) return;

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];
  const context = execution.context as unknown as ExecutionContext;

  // Update context with new message
  context.lastMessage = incomingMessage;
  context.lastQuickReplyPayload = quickReplyPayload;
  context.conversationHistory.push({ role: "user", content: incomingMessage });

  await prisma.automationExecution.update({
    where: { id: executionId },
    data: { status: "RUNNING", context: context as unknown as Record<string, unknown> },
  });

  // Log inbound message
  await prisma.automationMessage.create({
    data: {
      executionId,
      direction: "INBOUND",
      text: incomingMessage,
      nodeId: execution.currentNode,
    },
  });

  // Find the next node after the current waiting node
  const currentNodeId = execution.currentNode;
  if (!currentNodeId) return;

  // For quick_reply nodes, route based on the payload
  const currentNode = nodes.find((n) => n.id === currentNodeId);
  if (currentNode?.type === "quick_reply" && quickReplyPayload) {
    const edge = edges.find(
      (e) => e.source === currentNodeId && e.sourceHandle === quickReplyPayload
    ) || edges.find((e) => e.source === currentNodeId);
    if (edge) {
      const nextNode = nodes.find((n) => n.id === edge.target);
      if (nextNode) {
        await processNode(executionId, nextNode, nodes, edges, flow);
        return;
      }
    }
  }

  // Default: follow first edge from current node
  const edge = edges.find((e) => e.source === currentNodeId);
  if (edge) {
    const nextNode = nodes.find((n) => n.id === edge.target);
    if (nextNode) {
      await processNode(executionId, nextNode, nodes, edges, flow);
      return;
    }
  }

  // No next node — complete
  await prisma.automationExecution.update({
    where: { id: executionId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

/** Process a single node and continue to next */
async function processNode(
  executionId: string,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  flow: { id: string; clientId: string; platform: string }
): Promise<void> {
  const execution = await prisma.automationExecution.findUnique({ where: { id: executionId } });
  if (!execution || execution.status === "FAILED") return;

  const context = (execution.context || { variables: {}, conversationHistory: [], tags: [], lastMessage: "" }) as unknown as ExecutionContext;

  try {
    switch (node.type) {
      case "message": {
        const text = replaceVariables(node.data.text as string || "", context.variables);
        const mediaUrl = node.data.mediaUrl as string | undefined;
        const quickReplies = node.data.quickReplies as { label: string; value: string }[] | undefined;

        await sendDM(flow, execution.contactId!, text, mediaUrl, quickReplies);

        // Log outbound
        await prisma.automationMessage.create({
          data: { executionId, direction: "OUTBOUND", text, nodeId: node.id, mediaUrl },
        });

        context.conversationHistory.push({ role: "assistant", content: text });
        break;
      }

      case "ai_response": {
        const systemPrompt = node.data.systemPrompt as string || "You are a helpful assistant.";
        const maxTokens = (node.data.maxTokens as number) || 300;
        const model = node.data.model as string | undefined;

        const aiText = await generateAIResponse({
          systemPrompt,
          conversationHistory: context.conversationHistory,
          currentMessage: context.lastMessage,
          maxTokens,
          model,
          variables: context.variables,
        });

        await sendDM(flow, execution.contactId!, aiText);

        await prisma.automationMessage.create({
          data: { executionId, direction: "OUTBOUND", text: aiText, nodeId: node.id },
        });

        context.conversationHistory.push({ role: "assistant", content: aiText });
        break;
      }

      case "quick_reply": {
        const text = replaceVariables(node.data.text as string || "Choose an option:", context.variables);
        const options = node.data.options as { label: string; value: string }[] || [];

        await sendDM(flow, execution.contactId!, text, undefined, options);

        await prisma.automationMessage.create({
          data: {
            executionId,
            direction: "OUTBOUND",
            text,
            nodeId: node.id,
            metadata: { quickReplies: options },
          },
        });

        context.conversationHistory.push({ role: "assistant", content: text });

        // Pause and wait for user to pick an option
        await prisma.automationExecution.update({
          where: { id: executionId },
          data: { status: "PAUSED", currentNode: node.id, context: context as unknown as Record<string, unknown> },
        });
        return; // Stop processing — will resume when user replies
      }

      case "condition": {
        const field = node.data.field as string || "lastMessage";
        const operator = node.data.operator as string || "contains";
        const value = node.data.value as string || "";

        const fieldValue = field === "lastMessage"
          ? context.lastMessage
          : field === "lastQuickReplyPayload"
          ? context.lastQuickReplyPayload || ""
          : context.variables[field] || "";

        const matches = evaluateCondition(fieldValue, operator, value);

        // Route to "yes" or "no" handle
        const handle = matches ? "yes" : "no";
        const edge = edges.find((e) => e.source === node.id && e.sourceHandle === handle)
          || edges.find((e) => e.source === node.id);

        if (edge) {
          const nextNode = nodes.find((n) => n.id === edge.target);
          if (nextNode) {
            await prisma.automationExecution.update({
              where: { id: executionId },
              data: { context: context as unknown as Record<string, unknown> },
            });
            await processNode(executionId, nextNode, nodes, edges, flow);
            return;
          }
        }
        break;
      }

      case "delay": {
        const duration = (node.data.duration as number) || 5;
        const unit = (node.data.unit as string) || "seconds";
        const ms = unit === "minutes" ? duration * 60000 : unit === "hours" ? duration * 3600000 : duration * 1000;

        // For short delays (< 30s), wait inline
        if (ms <= 30000) {
          await new Promise((r) => setTimeout(r, ms));
        }
        // For longer delays, we'd need a job queue. For now, cap at 30s.
        break;
      }

      case "tag": {
        const tagName = node.data.tagName as string || "";
        if (tagName) {
          context.tags.push(tagName);
          context.variables[`tag_${tagName}`] = "true";
        }
        break;
      }

      case "notify": {
        const channel = node.data.channel as string || "telegram";
        const message = replaceVariables(node.data.message as string || "New lead from automation", context.variables);

        if (channel === "telegram") {
          const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
          if (chatId) {
            await sendTelegramMessage(
              chatId,
              `🤖 <b>Automation Alert</b>\n${message}\n\nContact: ${context.variables.contactName || "Unknown"}`,
              "HTML"
            ).catch(() => {});
          }
        }
        break;
      }

      case "set_variable": {
        const varName = node.data.variableName as string || "";
        const varValue = node.data.variableValue as string || "";
        if (varName) {
          context.variables[varName] = replaceVariables(varValue, context.variables);
        }
        break;
      }

      case "end": {
        await prisma.automationExecution.update({
          where: { id: executionId },
          data: { status: "COMPLETED", completedAt: new Date(), context: context as unknown as Record<string, unknown> },
        });
        return;
      }

      default:
        break;
    }

    // Save updated context
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { context: context as unknown as Record<string, unknown> },
    });

    // Follow edge to next node
    const nextEdge = edges.find((e) => e.source === node.id);
    if (nextEdge) {
      const nextNode = nodes.find((n) => n.id === nextEdge.target);
      if (nextNode) {
        await processNode(executionId, nextNode, nodes, edges, flow);
        return;
      }
    }

    // No more nodes — complete
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } catch (err) {
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function replaceVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

function evaluateCondition(fieldValue: string, operator: string, value: string): boolean {
  const lowerField = fieldValue.toLowerCase();
  const lowerValue = value.toLowerCase();

  switch (operator) {
    case "contains": return lowerField.includes(lowerValue);
    case "not_contains": return !lowerField.includes(lowerValue);
    case "equals": return lowerField === lowerValue;
    case "not_equals": return lowerField !== lowerValue;
    case "starts_with": return lowerField.startsWith(lowerValue);
    case "ends_with": return lowerField.endsWith(lowerValue);
    case "exists": return fieldValue.length > 0;
    case "not_exists": return fieldValue.length === 0;
    default: return false;
  }
}

async function sendDM(
  flow: { clientId: string; platform: string },
  recipientId: string,
  text: string,
  mediaUrl?: string,
  quickReplies?: { label: string; value: string }[]
): Promise<void> {
  // Get credentials for this client + platform
  const credential = await prisma.credential.findFirst({
    where: { clientId: flow.clientId, platform: { contains: flow.platform, mode: "insensitive" } },
  });

  if (!credential) throw new Error(`No ${flow.platform} credentials found for this client`);

  const ivData: Record<string, string | null> = JSON.parse(credential.iv);
  if (!ivData.username || !ivData.password) throw new Error("Credential data corrupted");

  const pageId = decrypt(credential.username, ivData.username);
  const accessToken = decrypt(credential.password, ivData.password);

  const options = {
    recipientId,
    accessToken,
    pageId,
    text,
    mediaUrl,
    quickReplies: quickReplies ? buildQuickReplies(quickReplies) : undefined,
  };

  if (flow.platform === "FACEBOOK") {
    await sendFacebookMessage(options);
  } else {
    await sendInstagramDM(options);
  }
}
