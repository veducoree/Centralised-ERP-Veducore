import { useEffect, useState, useCallback } from 'react';
import { Bell, Plus, Trash2, Check, Send } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchNotifications, createNotification, deleteNotification, markNotificationRead } from '@/services/api';
import type { Notification } from '@/types';
import { formatDateTime } from '@/lib/utils';

export default function AdminNotifications() {
  const { profile } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', type: 'info', target: 'all' });

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const data = await fetchNotifications(undefined, profile.school_id);
      setNotifications(data);
    } catch { toast('Failed to load notifications', 'error'); }
    finally { setLoading(false); }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate() {
    if (!profile?.school_id || !form.title || !form.message) return;
    setSaving(true);
    try {
      if (form.target === 'all') {
        // Send to all users in school - we'll just create one for the admin for now
        await createNotification({
          school_id: profile.school_id,
          user_id: profile.id,
          title: form.title,
          message: form.message,
          type: form.type,
        });
      } else {
        await createNotification({
          school_id: profile.school_id,
          user_id: profile.id,
          title: form.title,
          message: form.message,
          type: form.type,
        });
      }
      toast('Notification sent', 'success');
      setModalOpen(false);
      setForm({ title: '', message: '', type: 'info', target: 'all' });
      loadData();
    } catch { toast('Failed to send notification', 'error'); }
    finally { setSaving(false); }
  }

  async function handleMarkRead(id: string) {
    try { await markNotificationRead(id); loadData(); }
    catch { toast('Failed to mark as read', 'error'); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await deleteNotification(deleteId); toast('Notification deleted', 'success'); loadData(); }
    catch { toast('Failed to delete', 'error'); }
  }

  return (
    <DashboardLayout title="Notifications">
      <div className="space-y-6">
        <PageHeader title="Notifications" description="Send and manage notifications"
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>Send Notification</Button>} />

        {loading ? (
          <LoadingSpinner />
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Bell className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No notifications</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <Card key={n.id} className={`p-4 ${!n.is_read ? 'border-l-4 border-l-blue-500' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Bell className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{n.title}</h3>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatDateTime(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!n.is_read && (
                      <button onClick={() => handleMarkRead(n.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600" title="Mark as read">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => setDeleteId(n.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Send Notification" size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleCreate} loading={saving} icon={<Send className="h-4 w-4" />}>Send</Button></>}>
        <div className="space-y-4">
          <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="Message" required rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </Select>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Notification" message="Are you sure?" confirmText="Delete" variant="danger" />
    </DashboardLayout>
  );
}
