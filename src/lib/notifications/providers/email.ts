/**
 * Resend EmailProvider — the only channel implemented in v0.1.1.
 * Never call this from business logic; use NotificationService.
 */

import { Resend } from "resend";
import { resendFromAddress } from "@/lib/email/resend-from";
import type { NotificationMessage, NotificationProvider, SendResult } from "../types";

export class EmailProvider implements NotificationProvider {
  readonly channel = "email" as const;
  readonly providerId = "resend";

  isAvailable(): boolean {
    return Boolean(process.env.RESEND_API_KEY?.trim());
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    if (message.channel !== "email") {
      return { ok: false, status: "failed", errorReason: "EmailProvider received non-email channel" };
    }
    if (!this.isAvailable()) {
      return {
        ok: false,
        status: "skipped",
        skippedReason: "RESEND_API_KEY is not configured",
      };
    }
    if (!message.recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.recipient)) {
      return { ok: false, status: "failed", errorReason: "Invalid recipient email" };
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: resendFromAddress(),
        to: message.recipient,
        subject: message.subject,
        html: message.html ?? `<p>${message.text ?? ""}</p>`,
        text: message.text,
      });

      if (error) {
        return {
          ok: false,
          status: "failed",
          errorReason: error.message ?? "Resend send failed",
        };
      }

      return {
        ok: true,
        status: "sent",
        providerMessageId: data?.id ?? null,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        errorReason: err instanceof Error ? err.message : "Email send exception",
      };
    }
  }
}

/** Future stubs — registered but unavailable until funded. */
export class WhatsAppProviderStub implements NotificationProvider {
  readonly channel = "whatsapp" as const;
  readonly providerId = "stub";
  isAvailable() {
    return false;
  }
  async send(_message?: NotificationMessage): Promise<SendResult> {
    return { ok: false, status: "skipped", skippedReason: "WhatsApp provider not enabled" };
  }
}

export class SmsProviderStub implements NotificationProvider {
  readonly channel = "sms" as const;
  readonly providerId = "stub";
  isAvailable() {
    return false;
  }
  async send(_message?: NotificationMessage): Promise<SendResult> {
    return { ok: false, status: "skipped", skippedReason: "SMS provider not enabled" };
  }
}

export class PushProviderStub implements NotificationProvider {
  readonly channel = "push" as const;
  readonly providerId = "stub";
  isAvailable() {
    return false;
  }
  async send(_message?: NotificationMessage): Promise<SendResult> {
    return { ok: false, status: "skipped", skippedReason: "Push provider not enabled" };
  }
}
