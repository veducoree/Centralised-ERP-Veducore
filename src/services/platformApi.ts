// School-side access to Veducore platform features: suspension status,
// switched-off modules, subscription, announcements and support tickets.
import { supabase } from '@/lib/supabase';

export interface SchoolPlatformStatus {
  school_id?: string;
  school_name?: string;
  status?: 'Active' | 'Inactive';
  suspension_reason?: string | null;
  disabled_modules?: string[];
  plan_name?: string | null;
  subscription_status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired' | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
}

export async function fetchSchoolPlatformStatus(): Promise<SchoolPlatformStatus> {
  const { data, error } = await supabase!.rpc('school_platform_status');
  if (error) throw error;
  return (data as SchoolPlatformStatus) ?? {};
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  created_at: string;
}

export async function fetchPlatformAnnouncements(): Promise<PlatformAnnouncement[]> {
  const { data, error } = await supabase!
    .from('platform_announcements')
    .select('id, title, body, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as PlatformAnnouncement[];
}

// ── Support tickets ──────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketCategory = 'general' | 'bug' | 'billing' | 'feature' | 'account' | 'data';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  ticket_number: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  raised_by_name: string | null;
  last_reply_at: string;
  last_reply_by: 'school' | 'veducore';
  created_at: string;
}

export interface SupportMessage {
  id: string;
  author_type: 'school' | 'veducore';
  author_name: string | null;
  body: string;
  created_at: string;
}

export async function fetchMySupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase!
    .from('support_tickets')
    .select('id, ticket_number, subject, category, priority, status, raised_by_name, last_reply_at, last_reply_by, created_at')
    .order('last_reply_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

export async function createSupportTicket(input: {
  schoolId: string; userId: string; userName: string;
  subject: string; category: TicketCategory; priority: TicketPriority; body: string;
}): Promise<string> {
  const { data, error } = await supabase!
    .from('support_tickets')
    .insert({
      school_id: input.schoolId,
      raised_by: input.userId,
      raised_by_name: input.userName,
      subject: input.subject.trim(),
      category: input.category,
      priority: input.priority,
    })
    .select('id')
    .single();
  if (error) throw error;
  await sendSupportMessage(data.id, input.userId, input.userName, input.body);
  return data.id as string;
}

export async function fetchSupportMessages(ticketId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase!
    .from('support_ticket_messages')
    .select('id, author_type, author_name, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
}

export async function sendSupportMessage(ticketId: string, userId: string, userName: string, body: string) {
  const { error } = await supabase!.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    author_type: 'school',
    author_id: userId,
    author_name: userName,
    body: body.trim(),
  });
  if (error) throw error;
}

export async function closeSupportTicket(ticketId: string) {
  const { error } = await supabase!.rpc('close_my_support_ticket', { p_ticket: ticketId });
  if (error) throw error;
}
