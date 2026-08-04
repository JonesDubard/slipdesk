/**
 * Swappable employee-portal authentication methods.
 *
 * v0.1.0 implements PasswordAuth only (HR-assigned PIN/password).
 * A future funded track may add OtpAuth (SMS/WhatsApp) without restructuring
 * callers — register the method and select via ACTIVE_AUTH_METHOD.
 *
 * COST CONSTRAINT: this release must not call any paid messaging API.
 */

export type AuthMethodId = "password" | "otp";

/** Active method for this release — password only. */
export const ACTIVE_AUTH_METHOD: AuthMethodId = "password";

export type PasswordAuthInput = {
  method: "password";
  /** Liberian phone used as username only (no SMS). */
  identifier: string;
  password: string;
};

/** Reserved for a future OTP track — not implemented in v0.1.0. */
export type OtpAuthInput = {
  method: "otp";
  identifier: string;
  code: string;
};

export type AuthInput = PasswordAuthInput | OtpAuthInput;

export type AuthenticatedEmployee = {
  employeeId: string;
  companyId: string;
  mustChangePassword: boolean;
};

export type AuthSuccess = {
  ok: true;
  employee: AuthenticatedEmployee;
};

export type AuthFailure = {
  ok: false;
  error: string;
  status: number;
  retryAfterMs?: number;
  code?: "locked" | "invalid" | "disabled" | "not_configured" | "unsupported";
};

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Pluggable auth method. Implementations must never return plaintext secrets.
 */
export interface AuthMethod {
  readonly id: AuthMethodId;
  authenticate(input: AuthInput): Promise<AuthResult>;
}

export function assertPasswordInput(input: AuthInput): asserts input is PasswordAuthInput {
  if (input.method !== "password") {
    throw new Error("PasswordAuth received non-password input");
  }
}
