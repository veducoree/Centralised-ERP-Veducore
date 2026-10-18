import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { updateStudent } from '@/services/api';
import { getInitials } from '@/lib/utils';
import type { Student } from '@/types';

// ─── Image compression ────────────────────────────────────────────────────────
// Draws the image onto an offscreen canvas at a capped resolution, then exports
// as JPEG at 0.75 quality. Typical result: < 80 KB regardless of input size.

const MAX_DIMENSION = 400; // px — enough for a rounded avatar, small for storage
const JPEG_QUALITY = 0.75;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        // Calculate target dimensions (preserve aspect ratio)
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StudentPhotoUploadProps {
  student: Student;
  onUpdated: () => void;
  /** Size of the avatar circle in pixels. Defaults to 40. */
  size?: number;
}

export function StudentPhotoUpload({ student, onUpdated, size = 40 }: StudentPhotoUploadProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const initials = getInitials(student.full_name);
  const fontSize = size <= 32 ? 'text-xs' : size <= 48 ? 'text-sm' : 'text-base';

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      await updateStudent(student.id, { avatar_url: compressed });
      toast('Photo updated', 'success');
      onUpdated();
    } catch {
      toast('Failed to update photo', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        disabled={uploading}
        title={uploading ? 'Uploading…' : student.avatar_url ? 'Change photo' : 'Upload photo'}
        className="group relative flex items-center justify-center overflow-hidden rounded-full bg-blue-100 text-blue-700 font-bold transition hover:ring-2 hover:ring-blue-400 disabled:cursor-not-allowed"
        style={{ width: size, height: size }}
      >
        {student.avatar_url ? (
          <img
            src={student.avatar_url}
            alt={student.full_name}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className={`select-none ${fontSize}`}>{initials}</span>
        )}

        {/* Upload overlay on hover */}
        {!uploading && (
          <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="text-white" style={{ width: size * 0.35, height: size * 0.35 }} />
          </span>
        )}
      </button>

      {/* Spinner overlay while uploading */}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
          <span
            className="animate-spin rounded-full border-2 border-gray-200 border-t-blue-500"
            style={{ width: size * 0.5, height: size * 0.5 }}
          />
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
