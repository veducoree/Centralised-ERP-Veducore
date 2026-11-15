import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool, getCachedSchoolSync } from '@/services/api';
import type { School } from '@/types';

/** The signed-in user's school; updates live when Settings are saved. */
export function useSchool(): School | null {
  const { profile } = useAuth();
  const [school, setSchool] = useState<School | null>(() => getCachedSchoolSync(profile?.school_id));
  useEffect(() => {
    if (!profile?.school_id) return;
    let cancelled = false;
    fetchSchool(profile.school_id).then((s) => { if (!cancelled && s) setSchool(s); }).catch(() => {});
    const onUpdate = (e: Event) => {
      const s = (e as CustomEvent<School | null>).detail;
      if (s && s.id === profile.school_id) setSchool(s);
    };
    window.addEventListener('veducore:school-updated', onUpdate);
    return () => { cancelled = true; window.removeEventListener('veducore:school-updated', onUpdate); };
  }, [profile?.school_id]);
  return school;
}
