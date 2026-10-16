import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, ImageIcon, CreditCard } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool, updateSchool } from '@/services/api';
import type { School } from '@/types';

export default function AdminSettings() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', address: '', contact_number: '', email: '',
    academic_year: '', currency: '', currency_symbol: '', timezone: '',
  });

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const data = await fetchSchool(profile.school_id);
      if (data) {
        setSchool(data);
        setForm({
          name: data.name || '',
          address: data.address || '',
          contact_number: data.contact_number || '',
          email: data.email || '',
          academic_year: data.academic_year || '',
          currency: data.currency || '',
          currency_symbol: data.currency_symbol || '',
          timezone: data.timezone || '',
        });
        setLogoPreview(data.logo_url || null);
        setLogoBase64(null);
      }
    } catch {
      toast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      toast('Image size must be under 2MB', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      setLogoBase64(result);
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoPreview(null);
    setLogoBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    if (!profile?.school_id) return;
    setSaving(true);
    try {
      const updates: Partial<School> = { ...form };
      // If logo was changed (new upload or removed)
      if (logoBase64 !== null) {
        updates.logo_url = logoBase64;
      } else if (logoPreview === null && school?.logo_url) {
        // user removed logo
        updates.logo_url = null;
      }

      await updateSchool(profile.school_id, updates);
      toast('Settings saved successfully', 'success');
      loadData();
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        <PageHeader
          title="School Settings"
          description="Manage your school's configuration and branding"
        />

        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-5">
            {/* ── School Logo ── */}
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">School Logo</h3>
              <div className="flex items-start gap-6">
                {/* Preview */}
                <div className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden">
                  {logoPreview ? (
                    <>
                      <img
                        src={logoPreview}
                        alt="School logo"
                        className="h-full w-full object-contain p-2"
                      />
                      <button
                        onClick={removeLogo}
                        className="absolute right-1 top-1 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  )}
                </div>

                {/* Upload area */}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-1">Upload School Logo</p>
                  <p className="text-xs text-gray-400 mb-3">
                    PNG, JPG, SVG — max 2MB. Will appear in the sidebar next to Veducore branding.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoPreview ? 'Change Logo' : 'Upload Logo'}
                  </Button>
                </div>
              </div>
            </Card>

            {/* ── School Info ── */}
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">School Information</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="School Name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  label="Contact Number"
                  value={form.contact_number}
                  onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
                />
                <Input
                  label="Academic Year"
                  value={form.academic_year}
                  onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                />
                <Input
                  label="Currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
                <Input
                  label="Currency Symbol"
                  value={form.currency_symbol}
                  onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
                />
                <Input
                  label="Timezone"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <Textarea
                    label="Address"
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSave} loading={saving}>Save Changes</Button>
              </div>
            </Card>

            {/* ── Online Payment Setup ── */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Online Payments</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Configure your Razorpay API keys to accept online fee payments from parents.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/admin/fees')}
                  >
                    Go to Payment Setup
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
