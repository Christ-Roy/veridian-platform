/**
 * Types miroir des contrats Go pour les endpoints Notifuse Veridian-aware.
 * Voir docs/saas-standards.md §6 (Provisioning API) pour le contrat HMAC.
 */

export type NotifusePlan = 'free' | 'pro' | 'enterprise';

export interface ProvisionInput {
  tenantId: string;
  ownerEmail: string;
  workspaceName?: string;
  plan?: NotifusePlan;
}

export interface ProvisionResponse {
  workspace_id: string;
  owner_user_id: string;
  api_key: string;
  api_key_email: string;
  /** Fallback magic link `/console/signin?email=X&code=Y` (saisie manuelle code). */
  magic_link: string;
  /** Self-contained URL `/veridian/auto-login?token=<HMAC>` qui logge directement
   * le user via localStorage (TTL 60s). C'est l'URL que le Hub utilise pour
   * son bouton "Open Notifuse" sans saisie. */
  auto_login_url: string;
  plan: NotifusePlan;
  created: boolean;
}

export interface UpdatePlanInput {
  tenantId: string;
  plan: NotifusePlan;
}

export interface SuspendInput {
  tenantId: string;
  reason?: string;
}

export interface ResumeInput {
  tenantId: string;
}

export interface StatusResponse {
  tenant_id: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: NotifusePlan;
  monthly_email_quota: number;
  emails_sent_this_month: number;
  quota_remaining: number;
  suspended_at?: string;
  suspended_reason?: string;
  deleted_at?: string;
  quota_resets_at?: string;
}

export interface MagicLinkInput {
  apiKey: string;
  userEmail: string;
}

export interface MagicLinkResponse {
  magic_link: string;
  /** Self-contained auto-login URL (préférée — pas de saisie de code). */
  auto_login_url: string;
  expires_at: string;
}

export type NotifuseEventType =
  | 'tenant.provisioned'
  | 'tenant.suspended'
  | 'tenant.resumed'
  | 'tenant.deleted'
  | 'tenant.quota_exceeded'
  | 'email.sent';

export interface VeridianEventPayload<T = unknown> {
  event_id: string;
  event_type: NotifuseEventType;
  tenant_id: string;
  occurred_at: string;
  data: T;
}

export interface TenantSuspendedEventData {
  suspended_at: string;
  reason?: string;
}

export interface TenantResumedEventData {
  resumed_at: string;
}

export interface TenantDeletedEventData {
  deleted_at: string;
}

export interface EmailSentEventData {
  message_id: string;
  to: string;
  sent_at: string;
}

export interface QuotaExceededEventData {
  monthly_email_quota: number;
  emails_sent_this_month: number;
}

export class NotifuseError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'NotifuseError';
  }
}
