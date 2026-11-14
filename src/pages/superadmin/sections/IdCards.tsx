// ID card studio for the Veducore superadmin portal (moved out of
// Superadmin.tsx unchanged; now calls the authenticated API).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle, AlertTriangle, Building2, Check, CheckCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Contact2, Eye, FileText, Image as ImageIcon, Loader2, Palette, Plus, Printer, School, Search, Upload,
  UserX, Users, X,
} from 'lucide-react';
import { callManageSchools, type SchoolRecord } from '../api';

export interface StudentIdCardRecord {
  id: string;
  admissionNumber: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  parentEmail: string;
  dob: string;
  gender: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  classSection: string;
  rollNumber: number | null;
  address: string;
  avatarUrl: string | null;
  bloodGroup: string;
  emergencyContact: string;
  hasPhoto: boolean;
  isInfoComplete: boolean;
  status: string;
}

export interface IdCardMetrics {
  totalStudents: number;
  withPhotoCount: number;
  missingPhotoCount: number;
  photoCompletenessPct: number;
  completeInfoCount: number;
  incompleteInfoCount: number;
  infoCompletenessPct: number;
}

// ── Student ID Cards Generator & Template Management ─────────────────────────

interface TemplateDesignConfig {
  preset: 'classic-navy' | 'emerald' | 'crimson' | 'modern-dark';
  orientation: 'landscape' | 'portrait';
  primaryColor: string;
  accentColor: string;
  showLogo: boolean;
  showBarcode: boolean;
  showSignature: boolean;
  showEmergency: boolean;
  customBackgroundUrl: string | null;
  institutionSubtitle: string;
}

const DEFAULT_TEMPLATE_CONFIG: TemplateDesignConfig = {
  preset: 'classic-navy',
  orientation: 'landscape',
  primaryColor: '#1e3a8a',
  accentColor: '#d97706',
  showLogo: true,
  showBarcode: true,
  showSignature: true,
  showEmergency: true,
  customBackgroundUrl: null,
  institutionSubtitle: 'STUDENT IDENTITY CARD',
};

const TEMPLATE_PRESETS: {
  id: 'classic-navy' | 'emerald' | 'crimson' | 'modern-dark';
  name: string;
  primary: string;
  accent: string;
}[] = [
  { id: 'classic-navy', name: 'Royal Navy & Gold', primary: '#1e3a8a', accent: '#d97706' },
  { id: 'emerald', name: 'Emerald Academy', primary: '#065f46', accent: '#10b981' },
  { id: 'crimson', name: 'Crimson Heritage', primary: '#831843', accent: '#fb7185' },
  { id: 'modern-dark', name: 'Executive Slate', primary: '#0f172a', accent: '#38bdf8' },
];

const PREVIEW_PLACEHOLDER_STUDENT: StudentIdCardRecord = {
  id: 'preview-sample',
  admissionNumber: 'GVC-2026-001',
  fullName: 'Aarav Sharma',
  fatherName: 'Rajesh Sharma',
  motherName: 'Sunita Sharma',
  parentEmail: 'parent@example.com',
  dob: '2014-04-12',
  gender: 'male',
  classId: 'c1',
  className: 'Class 5',
  sectionId: 's1',
  sectionName: 'A',
  classSection: 'Class 5 - A',
  rollNumber: 1,
  address: 'Campus Road, New Delhi',
  avatarUrl: null,
  bloodGroup: 'B+',
  emergencyContact: '+91 98765 43210',
  hasPhoto: false,
  isInfoComplete: true,
  status: 'active',
};

// Single ID Card Item
function StudentIdCardCard({
  student,
  school,
  template,
  onZoom,
}: {
  student: StudentIdCardRecord;
  school: SchoolRecord;
  template: TemplateDesignConfig;
  onZoom?: (student: StudentIdCardRecord) => void;
}) {
  const isLandscape = template.orientation === 'landscape';

  return (
    <div
      onClick={() => onZoom?.(student)}
      className={`relative bg-white rounded-xl border border-gray-300 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between cursor-pointer select-none ${
        isLandscape
          ? 'w-full max-w-[340px] h-[216px]'
          : 'w-full max-w-[240px] h-[340px]'
      }`}
      style={{
        boxSizing: 'border-box',
        backgroundImage: template.customBackgroundUrl ? `url(${template.customBackgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Background tint overlay if custom artwork exists */}
      {template.customBackgroundUrl && (
        <div className="absolute inset-0 bg-white/85 pointer-events-none z-0" />
      )}

      {/* ── CARD HEADER ── */}
      <div
        className="relative z-10 px-3 py-2 text-white flex items-center justify-between"
        style={{ backgroundColor: template.primaryColor }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {template.showLogo && (
            <div className="h-7 w-7 rounded bg-white/20 p-1 flex items-center justify-center flex-shrink-0">
              <School className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-[11px] font-bold uppercase tracking-tight truncate leading-tight">
              {school.name}
            </h4>
            <p className="text-[9px] text-white/80 uppercase tracking-widest truncate leading-none mt-0.5">
              {template.institutionSubtitle || 'STUDENT IDENTITY CARD'}
            </p>
          </div>
        </div>

        <span className="text-[9px] font-semibold bg-white/20 px-1.5 py-0.5 rounded flex-shrink-0">
          {school.academicYear || '2026-27'}
        </span>
      </div>

      {/* ── CARD BODY ── */}
      {isLandscape ? (
        <div className="relative z-10 px-3 py-2 flex items-center gap-3 flex-1 min-h-0">
          {/* Photo Container */}
          <div className="w-[72px] h-[86px] rounded-lg border border-gray-200 bg-gray-100 flex-shrink-0 overflow-hidden relative shadow-inner flex items-center justify-center">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.fullName}
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-1 text-center">
                <Users className="h-6 w-6 text-gray-400 mb-0.5" />
                <span className="text-[7.5px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1 leading-tight">
                  No Photo
                </span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="border-b border-gray-100 pb-1">
              <p className="text-xs font-bold text-gray-900 truncate leading-tight">
                {student.fullName}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                  {student.classSection}
                </span>
                {student.rollNumber && (
                  <span className="text-[10px] text-gray-500 font-medium">
                    Roll: #{student.rollNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <div>
                <span className="text-gray-400 text-[9px] block">Adm No:</span>
                <span className="font-mono font-semibold text-gray-800 text-[9.5px]">
                  {student.admissionNumber}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-[9px] block">DOB:</span>
                <span className="text-gray-700 font-medium text-[9.5px]">
                  {student.dob || 'N/A'}
                </span>
              </div>
              {template.showEmergency && (
                <>
                  <div>
                    <span className="text-gray-400 text-[9px] block">Blood:</span>
                    <span className="font-bold text-red-600 text-[9.5px]">
                      {student.bloodGroup}
                    </span>
                  </div>
                  <div className="truncate">
                    <span className="text-gray-400 text-[9px] block">Emergency:</span>
                    <span className="text-gray-800 font-medium text-[9px] truncate">
                      {student.emergencyContact}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 px-3 py-2 flex flex-col items-center flex-1 min-h-0 text-center space-y-1.5">
          <div className="w-[72px] h-[86px] rounded-lg border border-gray-200 bg-gray-100 overflow-hidden relative shadow-inner flex items-center justify-center">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.fullName}
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-1 text-center">
                <Users className="h-6 w-6 text-gray-400 mb-0.5" />
                <span className="text-[7.5px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1 leading-tight">
                  No Photo
                </span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-gray-900 truncate">{student.fullName}</p>
            <p className="text-[10px] font-semibold text-blue-700">{student.classSection}</p>
          </div>

          <div className="w-full text-left text-[9.5px] space-y-0.5 px-2 bg-gray-50/80 rounded py-1 border border-gray-100">
            <div className="flex justify-between">
              <span className="text-gray-400">Adm:</span>
              <span className="font-mono font-bold text-gray-800">{student.admissionNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Roll:</span>
              <span className="font-medium text-gray-700">#{student.rollNumber || 'N/A'}</span>
            </div>
            {template.showEmergency && (
              <div className="flex justify-between">
                <span className="text-gray-400">Emergency:</span>
                <span className="text-gray-700 font-medium truncate max-w-[100px]">{student.emergencyContact}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CARD FOOTER ── */}
      <div className="relative z-10 px-3 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[8px] text-gray-500">
        {template.showBarcode ? (
          <div className="flex flex-col">
            <div className="h-3.5 flex items-center gap-[1.5px] opacity-80">
              <span className="w-[1.5px] h-3.5 bg-black" />
              <span className="w-[1px] h-3.5 bg-black" />
              <span className="w-[2.5px] h-3.5 bg-black" />
              <span className="w-[1px] h-3.5 bg-black" />
              <span className="w-[2px] h-3.5 bg-black" />
              <span className="w-[1.5px] h-3.5 bg-black" />
              <span className="w-[1px] h-3.5 bg-black" />
              <span className="w-[2.5px] h-3.5 bg-black" />
              <span className="w-[1.5px] h-3.5 bg-black" />
            </div>
            <span className="font-mono text-[7px] text-gray-600">{student.admissionNumber}</span>
          </div>
        ) : (
          <span className="truncate max-w-[140px] text-[8.5px] text-gray-400">
            {school.city || school.address || 'Campus ID'}
          </span>
        )}

        {template.showSignature && (
          <div className="text-right">
            <span className="font-serif italic text-[8.5px] text-gray-700 font-bold block leading-none">
              Signature
            </span>
            <span className="text-[7px] text-gray-400 block border-t border-gray-300 mt-0.5 pt-0.5">
              Authorized Signatory
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ID Card Section Component (School Applications Directory + Guided Studio) ──
export default function IdCardsSection({
  schools,
  onNavigateToSchools,
  onTemplateSaved,
}: {
  schools: SchoolRecord[];
  onNavigateToSchools: () => void;
  onTemplateSaved?: () => void;
}) {
  // If null, shows the registered schools directory. When selected, enters school's ID Card Studio.
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'batch' | 'template' | 'inspector'>('batch');

  // Loaded real school data from backend
  const [schoolData, setSchoolData] = useState<{
    students: StudentIdCardRecord[];
    metrics: IdCardMetrics | null;
    classes: any[];
    sections: any[];
  }>({
    students: [],
    metrics: null,
    classes: [],
    sections: [],
  });
  const [loadingCards, setLoadingCards] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>('');

  // Template state
  const [templateConfig, setTemplateConfig] = useState<TemplateDesignConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState<boolean>(false);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'ready' | 'missing-photo' | 'incomplete'>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [zoomedStudent, setZoomedStudent] = useState<StudentIdCardRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentSchool = schools.find(s => s.id === selectedSchoolId) || null;

  // Check whether school has a template configured
  const hasConfiguredTemplate = templateSaved;

  // Fetch school data when a school is selected
  useEffect(() => {
    if (!selectedSchoolId) {
      setSchoolData({ students: [], metrics: null, classes: [], sections: [] });
      setTemplateConfig(DEFAULT_TEMPLATE_CONFIG);
      setTemplateSaved(false);
      setFetchError('');
      return;
    }

    let isCancelled = false;

    async function fetchCards() {
      setLoadingCards(true);
      setFetchError('');
      setSchoolData({ students: [], metrics: null, classes: [], sections: [] });
      setTemplateConfig(DEFAULT_TEMPLATE_CONFIG);
      setTemplateSaved(false);
      try {
        const res = await callManageSchools<any>({
          action: 'get-school-id-cards',
          school_id: selectedSchoolId,
        });

        if (isCancelled) return;

        if (res.error) {
          throw new Error(res.error);
        }

        const realStudents: StudentIdCardRecord[] = res.students || [];
        setSchoolData({
          students: realStudents,
          metrics: res.metrics || null,
          classes: res.classes || [],
          sections: res.sections || [],
        });

        // Load existing template if available
        if (res.school?.idCardConfig && Object.keys(res.school.idCardConfig).length > 0) {
          setTemplateConfig(prev => ({ ...prev, ...res.school.idCardConfig }));
          setTemplateSaved(true);
          setActiveTab('batch');
        } else if (res.school?.idCardTemplateUrl) {
          setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: res.school.idCardTemplateUrl }));
          setTemplateSaved(true);
          setActiveTab('batch');
        } else {
          // No template configured yet -> Automatically guide to template creation first!
          setTemplateSaved(false);
          setActiveTab('template');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setFetchError(err.message || 'Failed to fetch ID card data');
        }
      } finally {
        if (!isCancelled) setLoadingCards(false);
      }
    }

    fetchCards();
    return () => {
      isCancelled = true;
    };
  }, [selectedSchoolId]);

  // Derived metrics from REAL students only (no fake demo data!)
  const totalStudents = schoolData.students.length;
  const withPhotoCount = schoolData.students.filter(s => s.hasPhoto).length;
  const missingPhotoCount = totalStudents - withPhotoCount;
  const photoCompletenessPct = totalStudents > 0 ? Math.round((withPhotoCount / totalStudents) * 100) : 0;

  const completeInfoCount = schoolData.students.filter(s => s.isInfoComplete).length;
  const incompleteInfoCount = totalStudents - completeInfoCount;
  const infoCompletenessPct = totalStudents > 0 ? Math.round((completeInfoCount / totalStudents) * 100) : 0;

  const readyToPrintCount = schoolData.students.filter(s => s.hasPhoto && s.isInfoComplete).length;

  // Filtered real students
  const filteredStudents = useMemo(() => {
    return schoolData.students.filter(st => {
      const matchSearch =
        st.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.admissionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.className.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      if (filterMode === 'ready' && !(st.hasPhoto && st.isInfoComplete)) return false;
      if (filterMode === 'missing-photo' && st.hasPhoto) return false;
      if (filterMode === 'incomplete' && st.isInfoComplete) return false;

      if (selectedClass !== 'all' && st.className !== selectedClass) return false;
      return true;
    });
  }, [schoolData.students, searchQuery, filterMode, selectedClass]);

  // 10 students per page pagination
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Available classes for dropdown
  const classOptions = useMemo(() => {
    const set = new Set<string>();
    schoolData.students.forEach(s => {
      if (s.className) set.add(s.className);
    });
    return Array.from(set);
  }, [schoolData.students]);

  // Handlers
  function handlePrintBatch() {
    window.print();
  }

  function handleCustomTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const b64 = event.target?.result as string;
      setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: b64 }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveTemplate() {
    if (!selectedSchoolId) return;
    setSavingTemplate(true);
    setSaveMessage(null);
    try {
      const res = await callManageSchools<any>({
        action: 'update-id-card-template',
        school_id: selectedSchoolId,
        template_url: templateConfig.customBackgroundUrl,
        template_config: templateConfig,
      });

      if (res.error) throw new Error(res.error);
      setTemplateSaved(true);
      onTemplateSaved?.();
      setSaveMessage('ID Card template saved! All student cards will generate according to this template.');
      setTimeout(() => {
        setSaveMessage(null);
        setActiveTab('batch');
      }, 1500);
    } catch (err: any) {
      setSaveMessage(`Failed to save: ${err.message}`);
    } finally {
      setSavingTemplate(false);
    }
  }

  // Filtered schools for directory view
  const filteredSchools = useMemo(() => {
    return schools.filter(s =>
      s.name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
      s.city.toLowerCase().includes(schoolSearchQuery.toLowerCase())
    );
  }, [schools, schoolSearchQuery]);

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 1: SCHOOL APPLICATIONS DIRECTORY (When selectedSchoolId === null)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!selectedSchoolId || !currentSchool) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Contact2 className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-gray-900 tracking-tight">
                  Registered School Applications — ID Card Portals
                </h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select an applied school to upload its ID card template, verify student photo & data readiness, and generate 10-per-page batch sheets.
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search registered schools..."
                value={schoolSearchQuery}
                onChange={e => setSchoolSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Schools Cards Grid */}
        {filteredSchools.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center max-w-lg mx-auto shadow-sm">
            <School className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900">No School Found</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              {schools.length === 0
                ? 'No schools have registered or applied yet. Click Onboard School to begin.'
                : 'No schools matched your search query.'}
            </p>
            {schools.length === 0 && (
              <button
                onClick={onNavigateToSchools}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Onboard School
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSchools.map(school => {
              const hasTpl = Boolean(school.idCardConfig || school.idCardTemplateUrl);
              return (
                <div
                  key={school.id}
                  className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-100 flex-shrink-0">
                          {school.name.charAt(0) || 'S'}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 leading-tight">
                            {school.name}
                          </h3>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[220px]">
                            {school.city || school.address || 'Main Branch'}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 flex-shrink-0">
                        {school.academicYear || '2026-27'}
                      </span>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <span className="text-[10px] text-gray-400 block font-medium">Students</span>
                        <span className="font-bold text-gray-900">{school.students} Enrolled</span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <span className="text-[10px] text-gray-400 block font-medium">Template</span>
                        {hasTpl ? (
                          <span className="font-semibold text-green-700 flex items-center gap-1 text-[11px]">
                            <CheckCircle className="h-3 w-3" /> Configured
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700 flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="h-3 w-3" /> Needs Template
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Open Studio Button */}
                  <button
                    onClick={() => {
                      setSelectedSchoolId(school.id);
                      setCurrentPage(1);
                      setSearchQuery('');
                      setFilterMode('all');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <span>Open ID Card Studio</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 2: ACTIVE SCHOOL ID CARD STUDIO (Guided Template Setup or Batch Generator)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── PRINT-SPECIFIC STYLES (A4 2X5 GRID = 10 ID CARDS) ── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-id-card-sheet, #printable-id-card-sheet * {
            visibility: visible !important;
          }
          #printable-id-card-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 6mm !important;
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 5mm !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-hidden, aside, header, nav, button, input {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
        }
      `}</style>

      {/* ── TOP BREADCRUMB & SCHOOL HEADER ── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedSchoolId(null)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Schools</span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 tracking-tight">
                  {currentSchool.name}
                </h2>
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                  Session: {currentSchool.academicYear || '2026-27'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {currentSchool.city || currentSchool.address || 'Campus ID Card Management'}
              </p>
            </div>
          </div>

          {/* Action: Print Batch button (Only available when template exists and students exist) */}
          {hasConfiguredTemplate && filteredStudents.length > 0 && (
            <button
              onClick={handlePrintBatch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Batch (Page {safePage} - 10 Cards)
            </button>
          )}
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}
      {loadingCards && (
        <div className="rounded-3xl border border-slate-100 bg-white p-4 text-xs font-medium text-gray-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span>Loading students and template...</span>
        </div>
      )}

      {/* ── CONDITIONAL FLOW: IF NO TEMPLATE CONFIGURED YET -> GUIDED STEP 1 ── */}
      {!hasConfiguredTemplate ? (
        <div className="space-y-6">
          {/* Step 1 Alert Banner */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3.5 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900">
                Step 1: ID Card Template Required for {currentSchool.name}
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                Pehle school ka ID card template upload karein ya niche diye gaye designs me se customize karein. Template save karne ke baad hi bacchon ke identity cards 10-per-page batch layout me generate hongey.
              </p>
            </div>
          </div>

          {/* Template Designer Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Custom Artwork Upload */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Upload className="h-4 w-4 text-blue-600" />
                    Upload School Background Template Artwork
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Upload your school&apos;s custom design background (PNG, JPG, SVG).
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                  <div className="h-14 w-14 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                    {templateConfig.customBackgroundUrl ? (
                      <img
                        src={templateConfig.customBackgroundUrl}
                        alt="Custom Template"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {templateConfig.customBackgroundUrl
                        ? 'Custom School Artwork Attached'
                        : 'No custom artwork uploaded yet'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Standard CR80 (85.6 × 54 mm) at 300 DPI (approx 1012 × 638 px)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {templateConfig.customBackgroundUrl ? 'Change Template' : 'Upload Template File'}
                    </button>
                    {templateConfig.customBackgroundUrl && (
                      <button
                        onClick={() => setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: null }))}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Clear
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCustomTemplateUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Built-in Presets */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Palette className="h-4 w-4 text-blue-600" />
                    Or Select An Institutional Theme Preset
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pre-configured academic layouts optimized for school identity badges.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEMPLATE_PRESETS.map(preset => {
                    const isSelected = templateConfig.preset === preset.id && !templateConfig.customBackgroundUrl;
                    return (
                      <button
                        key={preset.id}
                        onClick={() =>
                          setTemplateConfig(prev => ({
                            ...prev,
                            preset: preset.id,
                            primaryColor: preset.primary,
                            accentColor: preset.accent,
                            customBackgroundUrl: null,
                          }))
                        }
                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-500/10 bg-blue-50/40'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div
                          className="h-8 w-8 rounded-lg shadow-sm flex-shrink-0"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-900">{preset.name}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {preset.primary} • {preset.accent}
                          </p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Orientation & Toggles */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-700 min-w-[120px]">
                    Orientation:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'landscape' }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        templateConfig.orientation === 'landscape'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Landscape (85.6 × 54 mm)
                    </button>
                    <button
                      onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'portrait' }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        templateConfig.orientation === 'portrait'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Portrait (54 × 85.6 mm)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showLogo}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showLogo: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show School Logo / Crest</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showBarcode}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showBarcode: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show Scannable Barcode Pattern</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showSignature}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showSignature: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show Principal Signature Seal</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showEmergency}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showEmergency: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show Blood Group & Emergency Contact</span>
                  </label>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    {saveMessage && (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1">
                        {saveMessage}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50"
                  >
                    {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Save Template & Activate Batch Generator
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Preview Card */}
            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-600" />
                  Live Template Preview
                </h3>
                <p className="text-xs text-gray-500">
                  Real-time preview of how student ID cards will look with this template.
                </p>

                <div className="flex justify-center p-4 bg-gray-50 rounded-3xl border border-slate-100">
                  <StudentIdCardCard
                    student={PREVIEW_PLACEHOLDER_STUDENT}
                    school={currentSchool}
                    template={templateConfig}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── WHEN TEMPLATE IS ACTIVE: SHOW KPI STATS + TABS + 10-PER-PAGE BATCH VIEW ── */
        <div className="space-y-6">
          {/* Readiness Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 font-medium">Enrolled Students</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{totalStudents}</p>
                <p className="text-[11px] text-gray-400 truncate">{currentSchool.name}</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                missingPhotoCount === 0 && totalStudents > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 font-medium">Photos Uploaded</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    missingPhotoCount === 0 && totalStudents > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {photoCompletenessPct}%
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {withPhotoCount} <span className="text-xs text-gray-400 font-normal">/ {totalStudents}</span>
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {missingPhotoCount > 0 ? (
                    <span className="text-amber-600 font-medium flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {missingPhotoCount} Missing Photos
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> All Photos Complete
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                incompleteInfoCount === 0 && totalStudents > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
              }`}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 font-medium">Data Completeness</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    incompleteInfoCount === 0 && totalStudents > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'
                  }`}>
                    {infoCompletenessPct}%
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {completeInfoCount} <span className="text-xs text-gray-400 font-normal">/ {totalStudents}</span>
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {incompleteInfoCount > 0 ? (
                    <span className="text-orange-600 font-medium">
                      {incompleteInfoCount} Incomplete Profiles
                    </span>
                  ) : (
                    <span className="text-indigo-600 font-medium">
                      Full Student Details
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <Printer className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 font-medium">Ready For Print</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{readyToPrintCount}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {totalPages} Batch Sheets (10 / Page)
                </p>
              </div>
            </div>
          </div>

          {/* Workspace Tabs */}
          <div className="border-b border-gray-200 flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab('batch')}
              className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'batch'
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Printer className="h-4 w-4" />
              <span>Batch Sheet View (10 / Page)</span>
              <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-bold">
                {filteredStudents.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('template')}
              className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'template'
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Palette className="h-4 w-4" />
              <span>Edit / Change Template</span>
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'inspector'
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Student Photo & Info Inspector</span>
            </button>
          </div>

          {/* ── TAB 1: BATCH SHEET (10 PER PAGE) ── */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search student, roll, or admission no..."
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    {(['all', 'ready', 'missing-photo', 'incomplete'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => {
                          setFilterMode(mode);
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          filterMode === mode
                            ? 'bg-blue-100 text-blue-800 font-semibold'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {mode === 'all' && `All (${totalStudents})`}
                        {mode === 'ready' && `Ready (${readyToPrintCount})`}
                        {mode === 'missing-photo' && `Missing Photo (${missingPhotoCount})`}
                        {mode === 'incomplete' && `Incomplete (${incompleteInfoCount})`}
                      </button>
                    ))}
                  </div>

                  {classOptions.length > 0 && (
                    <select
                      value={selectedClass}
                      onChange={e => {
                        setSelectedClass(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:border-blue-500 outline-none"
                    >
                      <option value="all">All Classes</option>
                      {classOptions.map(cls => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {filteredStudents.length > 0 && (
                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-2 md:pt-0">
                    <span className="text-xs text-gray-500 font-medium">
                      Sheet Page <strong className="text-gray-900">{safePage}</strong> of{' '}
                      <strong className="text-gray-900">{totalPages}</strong> (10 Cards / Sheet)
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={safePage <= 1}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        &larr; Prev 10
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={safePage >= totalPages}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next 10 &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 10-Students Batch Sheet Container */}
              <div className="bg-gray-50/60 rounded-3xl border border-slate-100 p-6">
                {filteredStudents.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center max-w-md mx-auto shadow-sm space-y-3">
                    <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                      <Users className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900">No Students Registered Yet</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {currentSchool.name} me abhi tak koi student admissions add nahi huye hain. Jaise hi student admission record add honge, unke identity cards yahan 10-per-page sheet me automatically show honge.
                    </p>
                    <button
                      onClick={onNavigateToSchools}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Schools Directory & Credentials
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4 print:hidden">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <Printer className="h-4 w-4 text-blue-600" />
                        <span>
                          Batch Sheet: Showing Students {(safePage - 1) * PAGE_SIZE + 1} to{' '}
                          {Math.min(safePage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        A4 Layout: 2 Columns × 5 Rows (10 Cards / Sheet)
                      </span>
                    </div>

                    <div
                      id="printable-id-card-sheet"
                      className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center"
                    >
                      {pagedStudents.map(student => (
                        <StudentIdCardCard
                          key={student.id}
                          student={student}
                          school={currentSchool}
                          template={templateConfig}
                          onZoom={st => setZoomedStudent(st)}
                        />
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                        <span>
                          Showing 10 student cards per batch sheet. Click &quot;Print Batch&quot; above to print current sheet.
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={safePage <= 1}
                            className="px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <span className="font-semibold text-gray-800">
                            Page {safePage} of {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={safePage >= totalPages}
                            className="px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: EDIT TEMPLATE ── */}
          {activeTab === 'template' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Custom Artwork */}
                <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-600" />
                      Update School Background Artwork
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Upload new custom template artwork (PNG, JPG, SVG).
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                    <div className="h-14 w-14 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                      {templateConfig.customBackgroundUrl ? (
                        <img
                          src={templateConfig.customBackgroundUrl}
                          alt="Custom Template"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-gray-400" />
                      )}
                    </div>

                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">
                        {templateConfig.customBackgroundUrl
                          ? 'Custom School Artwork Attached'
                          : 'No custom artwork uploaded'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        CR80 85.6 × 54 mm (approx 1012 × 638 px)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {templateConfig.customBackgroundUrl ? 'Replace File' : 'Upload File'}
                      </button>
                      {templateConfig.customBackgroundUrl && (
                        <button
                          onClick={() => setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: null }))}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Clear
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCustomTemplateUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Built-in Presets */}
                <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Palette className="h-4 w-4 text-blue-600" />
                      Theme Presets
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Switch between curated institutional color palettes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TEMPLATE_PRESETS.map(preset => {
                      const isSelected = templateConfig.preset === preset.id && !templateConfig.customBackgroundUrl;
                      return (
                        <button
                          key={preset.id}
                          onClick={() =>
                            setTemplateConfig(prev => ({
                              ...prev,
                              preset: preset.id,
                              primaryColor: preset.primary,
                              accentColor: preset.accent,
                              customBackgroundUrl: null,
                            }))
                          }
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-500/10 bg-blue-50/40'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div
                            className="h-8 w-8 rounded-lg shadow-sm flex-shrink-0"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-900">{preset.name}</p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                              {preset.primary} • {preset.accent}
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Orientation & Toggles */}
                <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-700 min-w-[120px]">
                      Orientation:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'landscape' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          templateConfig.orientation === 'landscape'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Landscape (85.6 × 54 mm)
                      </button>
                      <button
                        onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'portrait' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          templateConfig.orientation === 'portrait'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Portrait (54 × 85.6 mm)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showLogo}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showLogo: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show School Logo / Crest</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showBarcode}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showBarcode: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show Scannable Barcode Pattern</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showSignature}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showSignature: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show Principal Signature Seal</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showEmergency}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showEmergency: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show Blood Group & Emergency Contact</span>
                    </label>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      {saveMessage && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1">
                          {saveMessage}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Save Template Updates
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="space-y-4">
                <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                    Live Template Preview
                  </h3>
                  <p className="text-xs text-gray-500">
                    Sample preview reflecting your current template settings.
                  </p>

                  <div className="flex justify-center p-4 bg-gray-50 rounded-3xl border border-slate-100">
                    <StudentIdCardCard
                      student={PREVIEW_PLACEHOLDER_STUDENT}
                      school={currentSchool}
                      template={templateConfig}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: STUDENT PHOTO & INFO INSPECTOR ── */}
          {activeTab === 'inspector' && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Student Photo & Data Completeness Roster
                  </h3>
                  <p className="text-xs text-gray-500">
                    Verify that all students have photos uploaded and valid information prior to printing.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    Total: <strong>{totalStudents} Enrolled</strong>
                  </span>
                </div>
              </div>

              {totalStudents === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  No students registered in this school yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3">Photo Status</th>
                        <th className="px-5 py-3">Student Name</th>
                        <th className="px-5 py-3">Adm No</th>
                        <th className="px-5 py-3">Class & Section</th>
                        <th className="px-5 py-3">Roll No</th>
                        <th className="px-5 py-3">Blood Group</th>
                        <th className="px-5 py-3">Emergency Contact</th>
                        <th className="px-5 py-3">Readiness Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {schoolData.students.map(st => (
                        <tr key={st.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {st.avatarUrl ? (
                                <div className="h-8 w-8 rounded-full border border-gray-200 overflow-hidden flex-shrink-0">
                                  <img src={st.avatarUrl} alt={st.fullName} className="h-full w-full object-cover" />
                                </div>
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 font-bold text-[10px]">
                                  <UserX className="h-4 w-4" />
                                </div>
                              )}
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                st.hasPhoto
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                {st.hasPhoto ? 'Photo Ready' : 'Missing Photo'}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3 font-semibold text-gray-900">
                            {st.fullName}
                            {st.fatherName && (
                              <span className="block text-[10px] text-gray-400 font-normal">
                                S/D/O {st.fatherName}
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-3 font-mono text-gray-700">{st.admissionNumber}</td>
                          <td className="px-5 py-3 font-medium text-gray-800">{st.classSection}</td>
                          <td className="px-5 py-3 text-gray-600">{st.rollNumber || 'N/A'}</td>
                          <td className="px-5 py-3 font-bold text-red-600">{st.bloodGroup}</td>
                          <td className="px-5 py-3 text-gray-700 font-mono text-[11px]">{st.emergencyContact}</td>

                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              st.hasPhoto && st.isInfoComplete
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {st.hasPhoto && st.isInfoComplete ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" /> Ready for Print
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="h-3 w-3" /> Action Needed
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Single Card Zoom Modal */}
      {zoomedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Single Card Inspector</h3>
                <p className="text-xs text-gray-500">{zoomedStudent.fullName} • {zoomedStudent.admissionNumber}</p>
              </div>
              <button
                onClick={() => setZoomedStudent(null)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex justify-center py-4 bg-gray-50 rounded-3xl border border-slate-100">
              <StudentIdCardCard
                student={zoomedStudent}
                school={currentSchool}
                template={templateConfig}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded-md ${
                zoomedStudent.hasPhoto ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {zoomedStudent.hasPhoto ? 'Photo Uploaded' : 'Photo Missing - Upload in Admissions'}
              </span>
              <button
                onClick={() => setZoomedStudent(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-xs font-semibold text-gray-700 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
