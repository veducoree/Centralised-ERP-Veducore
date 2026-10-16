import React, { useState, useRef } from 'react';
import {
  Building2, Users, GraduationCap, BarChart3, Eye, EyeOff,
  Upload, CheckCircle, Plus, ChevronDown, ChevronRight, Globe,
  LogOut, TrendingUp,
} from 'lucide-react';
import veducoreLogo from '@/assets/veducore-logo.png';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchoolRecord {
  id: string;
  name: string;
  city: string;
  adminEmail: string;
  adminName: string;
  students: number;
  teachers: number;
  status: 'Active' | 'Inactive';
  joinedDate: string;
  lastLogin: string;
  academicYear: string;
  idCardTemplate: string | null;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const INITIAL_SCHOOLS: SchoolRecord[] = [
  {
    id: 'SCH001',
    name: 'Delhi Public School',
    city: 'New Delhi',
    adminEmail: 'admin@dps.edu.in',
    adminName: 'Ramesh Sharma',
    students: 1240,
    teachers: 68,
    status: 'Active',
    joinedDate: '2024-01-15',
    lastLogin: '2024-12-10',
    academicYear: '2024-25',
    idCardTemplate: null,
  },
  {
    id: 'SCH002',
    name: 'Ryan International School',
    city: 'Mumbai',
    adminEmail: 'admin@ryan.edu.in',
    adminName: 'Priya Menon',
    students: 980,
    teachers: 54,
    status: 'Active',
    joinedDate: '2024-02-20',
    lastLogin: '2024-12-09',
    academicYear: '2024-25',
    idCardTemplate: 'ryan_template.png',
  },
  {
    id: 'SCH003',
    name: 'Kendriya Vidyalaya No. 3',
    city: 'Bangalore',
    adminEmail: 'admin@kv3.edu.in',
    adminName: 'Suresh Nair',
    students: 760,
    teachers: 42,
    status: 'Active',
    joinedDate: '2024-03-05',
    lastLogin: '2024-12-08',
    academicYear: '2024-25',
    idCardTemplate: null,
  },
  {
    id: 'SCH004',
    name: "St. Mary's Convent School",
    city: 'Pune',
    adminEmail: 'admin@stmarys.edu.in',
    adminName: 'Sister Maria',
    students: 620,
    teachers: 35,
    status: 'Active',
    joinedDate: '2024-04-12',
    lastLogin: '2024-11-30',
    academicYear: '2024-25',
    idCardTemplate: 'stmarys_id_template.pdf',
  },
  {
    id: 'SCH005',
    name: 'Sunrise Academy',
    city: 'Jaipur',
    adminEmail: 'admin@sunrise.edu.in',
    adminName: 'Vikram Singh',
    students: 310,
    teachers: 22,
    status: 'Inactive',
    joinedDate: '2024-05-01',
    lastLogin: '2024-10-15',
    academicYear: '2024-25',
    idCardTemplate: null,
  },
];

// ── Login Screen ───────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (email === 'admin@veducore.com' && password === 'veducore@2024') {
        onLogin();
      } else {
        setError('Invalid email or password.');
        setLoading(false);
      }
    }, 600);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={veducoreLogo} alt="Veducore" className="h-10 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900">Veducore Management</h1>
          <p className="text-sm text-gray-500 mt-1">Internal team portal</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@veducore.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Overview Section ──────────────────────────────────────────────────────────

function OverviewSection({ schools }: { schools: SchoolRecord[] }) {
  const totalStudents = schools.reduce((sum, s) => sum + s.students, 0);
  const totalTeachers = schools.reduce((sum, s) => sum + s.teachers, 0);
  const activeSchools = schools.filter(s => s.status === 'Active').length;

  const stats = [
    { label: 'Total Schools', value: schools.length, icon: <Building2 className="h-6 w-6 text-blue-600" />, bg: 'bg-blue-50' },
    { label: 'Total Students', value: totalStudents.toLocaleString('en-IN'), icon: <Users className="h-6 w-6 text-indigo-600" />, bg: 'bg-indigo-50' },
    { label: 'Total Teachers', value: totalTeachers.toLocaleString('en-IN'), icon: <GraduationCap className="h-6 w-6 text-purple-600" />, bg: 'bg-purple-50' },
    { label: 'Active Schools', value: activeSchools, icon: <TrendingUp className="h-6 w-6 text-green-600" />, bg: 'bg-green-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Overview</h2>
        <p className="text-sm text-gray-500">Platform-wide summary across all schools.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.bg} mb-3`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs font-medium text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Recent Schools</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">School Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Admin Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Students</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schools.map(school => (
                <tr key={school.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{school.name}</p>
                    <p className="text-xs text-gray-400">{school.city}</p>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{school.adminEmail}</td>
                  <td className="px-5 py-3.5 text-gray-600">{school.students.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      school.status === 'Active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {school.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">{school.joinedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Schools Section ───────────────────────────────────────────────────────────

function SchoolsSection({ schools, onTemplateUpload }: {
  schools: SchoolRecord[];
  onTemplateUpload: (schoolId: string, filename: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleFileChange(schoolId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onTemplateUpload(schoolId, file.name);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Schools</h2>
        <p className="text-sm text-gray-500">Manage all registered schools and their ID card templates.</p>
      </div>

      <div className="space-y-3">
        {schools.map(school => (
          <div key={school.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{school.name}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      school.status === 'Active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {school.status}
                    </span>
                    {school.idCardTemplate && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        Template Ready
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{school.city} · {school.adminEmail}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === school.id ? null : school.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    View Details
                    {expandedId === school.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex gap-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  <span>{school.students.toLocaleString('en-IN')} students</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>{school.teachers} teachers</span>
                </div>
              </div>
            </div>

            {expandedId === school.id && (
              <div className="border-t border-gray-100 px-5 pb-5 pt-4 bg-gray-50/50">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">School Details</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Admin Name</span>
                        <span className="text-gray-900 font-medium">{school.adminName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Academic Year</span>
                        <span className="text-gray-900 font-medium">{school.academicYear}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Login</span>
                        <span className="text-gray-900 font-medium">{school.lastLogin}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">School ID</span>
                        <span className="text-gray-900 font-medium font-mono text-xs">{school.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ID Card Template</p>
                    {school.idCardTemplate ? (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                        <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-green-800 truncate">{school.idCardTemplate}</p>
                          <p className="text-xs text-green-600">Template uploaded</p>
                        </div>
                        <button
                          onClick={() => fileInputRefs.current[school.id]?.click()}
                          className="text-xs text-green-700 underline hover:no-underline flex-shrink-0"
                        >
                          Replace
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white p-3">
                        <Upload className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">No template uploaded</p>
                        </div>
                        <button
                          onClick={() => fileInputRefs.current[school.id]?.click()}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors flex-shrink-0"
                        >
                          <Upload className="h-3 w-3" />
                          Upload
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      ref={el => { fileInputRefs.current[school.id] = el; }}
                      onChange={e => handleFileChange(school.id, e)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Add New School Section ────────────────────────────────────────────────────

interface NewSchoolForm {
  name: string;
  address: string;
  city: string;
  contactNumber: string;
  email: string;
  academicYear: string;
  adminName: string;
  adminPassword: string;
}

const EMPTY_FORM: NewSchoolForm = {
  name: '',
  address: '',
  city: '',
  contactNumber: '',
  email: '',
  academicYear: '2024-25',
  adminName: '',
  adminPassword: '',
};

function AddSchoolSection({ onAdd }: { onAdd: (school: SchoolRecord) => void }) {
  const [form, setForm] = useState<NewSchoolForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<NewSchoolForm>>({});
  const [successData, setSuccessData] = useState<{ email: string; password: string; name: string } | null>(null);

  function validate(): boolean {
    const errs: Partial<NewSchoolForm> = {};
    if (!form.name.trim()) errs.name = 'School name is required';
    if (!form.email.trim()) errs.email = 'Admin email is required';
    if (!form.adminName.trim()) errs.adminName = 'Admin full name is required';
    if (!form.adminPassword.trim()) errs.adminPassword = 'Admin password is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const newSchool: SchoolRecord = {
      id: `SCH${String(Date.now()).slice(-4)}`,
      name: form.name,
      city: form.city || 'N/A',
      adminEmail: form.email,
      adminName: form.adminName,
      students: 0,
      teachers: 0,
      status: 'Active',
      joinedDate: new Date().toISOString().split('T')[0],
      lastLogin: 'Never',
      academicYear: form.academicYear,
      idCardTemplate: null,
    };

    onAdd(newSchool);
    setSuccessData({ email: form.email, password: form.adminPassword, name: form.name });
    setForm(EMPTY_FORM);
    setErrors({});
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Add New School</h2>
        <p className="text-sm text-gray-500">Register a new school on the Veducore platform.</p>
      </div>

      {successData && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-900">School Added Successfully!</p>
              <p className="text-sm text-green-700 mt-1">
                Admin credentials for <strong>{successData.name}</strong>:
              </p>
              <div className="mt-2 space-y-1 font-mono text-sm text-green-800 bg-white/60 rounded-lg p-3">
                <p>Email: <strong>{successData.email}</strong></p>
                <p>Password: <strong>{successData.password}</strong></p>
              </div>
              <p className="text-xs text-green-600 mt-2">Share these credentials with the school administrator.</p>
              <button
                onClick={() => setSuccessData(null)}
                className="mt-3 text-xs text-green-700 underline hover:no-underline"
              >
                Add another school
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">School Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Delhi Public School"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">School Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Street address"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder="e.g. New Delhi"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
              <input
                type="tel"
                value={form.contactNumber}
                onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                placeholder="e.g. +91 98765 43210"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="admin@schoolname.edu.in"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <input
                type="text"
                value={form.academicYear}
                onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))}
                placeholder="e.g. 2024-25"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.adminName}
                onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))}
                placeholder="e.g. Ramesh Sharma"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.adminName ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.adminName && <p className="mt-1 text-xs text-red-500">{errors.adminName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.adminPassword}
                  onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))}
                  placeholder="Set a strong password"
                  className={`w-full border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.adminPassword ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.adminPassword && <p className="mt-1 text-xs text-red-500">{errors.adminPassword}</p>}
            </div>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add School
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Section = 'overview' | 'schools' | 'add-school';

export default function VeducoreManagement() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [schools, setSchools] = useState<SchoolRecord[]>(INITIAL_SCHOOLS);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  function handleTemplateUpload(schoolId: string, filename: string) {
    setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, idCardTemplate: filename } : s));
  }

  function handleAddSchool(school: SchoolRecord) {
    setSchools(prev => [school, ...prev]);
  }

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'schools', label: 'Schools', icon: <Building2 className="h-4 w-4" /> },
    { id: 'add-school', label: 'Add New School', icon: <Plus className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-screen sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 h-16 px-4 border-b border-gray-200">
          <img src={veducoreLogo} alt="Veducore" className="h-6 w-auto object-contain" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Management</span>
        </div>

        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-0.5">
            {navItems.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeSection === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-gray-200 p-3">
          <button
            onClick={() => setLoggedIn(false)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-gray-900">Veducore Management Portal</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Globe className="h-3.5 w-3.5" />
              admin@veducore.com
            </div>
          </div>
        </header>

        <div className="p-6">
          {activeSection === 'overview' && <OverviewSection schools={schools} />}
          {activeSection === 'schools' && (
            <SchoolsSection schools={schools} onTemplateUpload={handleTemplateUpload} />
          )}
          {activeSection === 'add-school' && <AddSchoolSection onAdd={handleAddSchool} />}
        </div>
      </main>
    </div>
  );
}
