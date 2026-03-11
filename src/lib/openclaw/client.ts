interface OpenClawMessage {
  target_agent: string;
  message: string;
  metadata?: Record<string, unknown>;
  callback_url?: string;
}

export async function sendToOpenClaw(
  agentName: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = process.env.OPENCLAW_API_URL;
  const apiToken = process.env.OPENCLAW_API_TOKEN;

  if (!apiUrl || !apiToken) {
    console.warn("[OpenClaw] Not configured — skipping send");
    return { success: false, error: "OpenClaw not configured" };
  }

  const payload: OpenClawMessage = {
    target_agent: agentName.toLowerCase(),
    message,
    metadata: { ...metadata, source: "command-center" },
    callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/openclaw/webhook`,
  };

  try {
    const res = await fetch(`${apiUrl}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { success: false, error: `OpenClaw responded with ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function pingOpenClaw(): Promise<boolean> {
  const apiUrl = process.env.OPENCLAW_API_URL;
  const apiToken = process.env.OPENCLAW_API_TOKEN;

  if (!apiUrl || !apiToken) return false;

  try {
    const res = await fetch(`${apiUrl}/health`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Trigger points
export async function notifyProspectCreated(clientId: string, name: string, industry?: string, source?: string) {
  return sendToOpenClaw(
    "qualifier",
    `New prospect added: ${name}. Industry: ${industry || "unknown"}. Source: ${source || "unknown"}. Please begin qualification.`,
    { clientId }
  );
}

export async function notifyClientActivated(clientId: string, name: string) {
  return sendToOpenClaw(
    "nurture",
    `Client activated: ${name}. Begin nurture sequence and onboarding support.`,
    { clientId }
  );
}

export async function notifyInvoiceOverdue(clientId: string, clientName: string, invoiceId: string, amount: number) {
  return sendToOpenClaw(
    "outreach",
    `Invoice overdue for ${clientName}. Amount: $${amount}. Invoice ID: ${invoiceId}. Follow up on payment.`,
    { clientId, invoiceId }
  );
}

export async function notifyTaskBlocked(taskId: string, taskTitle: string, clientName?: string) {
  return sendToOpenClaw(
    "cortana",
    `Task blocked: "${taskTitle}"${clientName ? ` for ${clientName}` : ""}. Needs routing and resolution.`,
    { taskId }
  );
}
