/**
 * Domain enums shared by every workspace.
 *
 * Defined as `as const` tuples so we get BOTH a runtime list (for zod enums,
 * Mongoose `enum` validators and Angular dropdowns) AND a compile-time union type.
 */

export const ROLES = ['OWNER', 'AGENT', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const CHANNEL_TYPES = ['web', 'whatsapp'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CONVERSATION_STATUSES = ['open', 'pending', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_MODES = ['ai', 'human'] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_SENDERS = ['customer', 'ai', 'human', 'system'] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const MESSAGE_STATUSES = ['received', 'queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const LEAD_STATUSES = ['none', 'new', 'qualified', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const AGENT_TOOLS = ['createLead', 'listAvailableSlots', 'bookSlot', 'handoffToHuman'] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export const AGENT_TONES = ['friendly', 'professional', 'concise', 'playful'] as const;
export type AgentTone = (typeof AGENT_TONES)[number];

export const USAGE_EVENT_TYPES = [
  'llm_call',
  'llm_fallback',
  'llm_failure',
  'tool_call',
  'handoff',
  'message_in',
  'message_out',
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

/** Hard limits that protect the free tiers (Atlas 512 MB, LLM token quotas). */
export const LIMITS = {
  messageTextMaxChars: 4000,
  systemInstructionsMaxChars: 2000,
  defaultHistoryWindow: 10,
  defaultMaxReplyChars: 600,
} as const;
