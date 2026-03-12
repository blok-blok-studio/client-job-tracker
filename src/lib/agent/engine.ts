import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { SYSTEM_PROMPT, buildContextPayload } from "./prompts";
import { dispatchAction } from "./tasks";
import type { AgentAction } from "@/types";

const MAX_ACTIONS_PER_CYCLE = 50;

interface AgentCycleResult {
  success: boolean;
  actionsExecuted: number;
  errors: string[];
  analysis: string;
  duration: number;
}

export async function runAgentCycle(dryRun = false): Promise<AgentCycleResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let actionsExecuted = 0;

  // Check if agent is active
  const config = await prisma.agentConfig.findUnique({ where: { id: "default" } });
  if (!config?.isActive && !dryRun) {
    return {
      success: false,
      actionsExecuted: 0,
      errors: ["Agent is paused"],
      analysis: "Agent is currently paused",
      duration: Date.now() - startTime,
    };
  }

  const effectiveConfig = config || {
    allowedActions: ["create_task", "move_task", "send_reminder", "send_client_reminder", "generate_report", "flag_overdue", "update_checklist", "create_checklist_item", "log_note", "reply_support_ticket", "mark_invoice_overdue", "send_payment_reminder", "close_stale_ticket"],
    claudeModel: "claude-sonnet-4-20250514",
    maxTokens: 4096,
    systemPrompt: null,
  };

  try {
    // Build context
    const context = await buildContextPayload();

    // Log cycle start
    if (!dryRun) {
      await prisma.activityLog.create({
        data: {
          actor: "agent",
          action: "cycle_started",
          details: JSON.stringify({ timestamp: new Date().toISOString() }),
        },
      });
    }

    // Call Claude API
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: effectiveConfig.claudeModel,
      max_tokens: effectiveConfig.maxTokens,
      system: effectiveConfig.systemPrompt || SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the current state of operations. Analyze and take appropriate actions.\n\n${JSON.stringify(context, null, 2)}`,
        },
      ],
    });

    // Parse response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    let parsed: { analysis: string; actions: AgentAction[]; suggestions: AgentAction[] };
    try {
      // Try to extract JSON from response (may have markdown wrapping)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || responseText);
    } catch {
      return {
        success: false,
        actionsExecuted: 0,
        errors: ["Failed to parse agent response"],
        analysis: responseText.slice(0, 500),
        duration: Date.now() - startTime,
      };
    }

    const allActions = [
      ...(parsed.actions || []),
      ...(parsed.suggestions || []),
    ].slice(0, MAX_ACTIONS_PER_CYCLE);

    if (dryRun) {
      return {
        success: true,
        actionsExecuted: allActions.length,
        errors: [],
        analysis: parsed.analysis || "Dry run complete",
        duration: Date.now() - startTime,
      };
    }

    // Execute actions
    for (const action of allActions) {
      const result = await dispatchAction(action, effectiveConfig.allowedActions);
      if (result.success) {
        actionsExecuted++;
      } else {
        errors.push(`${action.action}: ${result.message}`);
      }
    }

    // Log cycle complete
    await prisma.activityLog.create({
      data: {
        actor: "agent",
        action: "cycle_completed",
        details: JSON.stringify({
          actionsExecuted,
          errors: errors.length,
          duration: Date.now() - startTime,
          analysis: parsed.analysis?.slice(0, 200),
        }),
      },
    });

    return {
      success: true,
      actionsExecuted,
      errors,
      analysis: parsed.analysis || "",
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);

    if (!dryRun) {
      await prisma.activityLog.create({
        data: {
          actor: "agent",
          action: "cycle_error",
          details: JSON.stringify({ error: message }),
        },
      });
    }

    return {
      success: false,
      actionsExecuted,
      errors,
      analysis: "Cycle failed with error",
      duration: Date.now() - startTime,
    };
  }
}
