import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { takeLoginNotice } from '@/lib/accountAccess';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/lib/utils';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// e.g. "v1.0.0 · a1b2c3" (OTA update id) or "v1.0.0 · build" (no OTA applied yet)
const VERSION_LABEL = `v${Constants.expoConfig?.version ?? '1.0.0'} · ${Updates.updateId && !Updates.isEmbeddedLaunch ? Updates.updateId.slice(0, 6) : 'build'}`;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  // Set when a paused school / deactivated login was just signed out.
  const [error, setError] = useState<string | null>(() => takeLoginNotice());
  const [fieldError, setFieldError] = useState<{ email?: boolean; password?: boolean }>({});

  const friendlyError = (msg: string) => {
    const m = msg.toLowerCase();
    if (m.includes('invalid') || m.includes('credential') || m.includes('password') || m.includes('not found'))
      return 'Incorrect email or password. Please try again.';
    if (m.includes('network') || m.includes('fetch') || m.includes('timeout'))
      return 'No internet connection. Check your network and try again.';
    return msg;
  };

  const handleLogin = async () => {
    const missingEmail = !email.trim();
    const missingPass = !password.trim();
    if (missingEmail || missingPass) {
      setFieldError({ email: missingEmail, password: missingPass });
      setError(
        missingEmail && missingPass
          ? 'Please enter your email and password.'
          : missingEmail
            ? 'Please enter your email address.'
            : 'Please enter your password.'
      );
      return;
    }
    setError(null);
    setFieldError({});
    setLoading(true);
    try {
      const { error: loginError } = await login(email.trim(), password);
      if (loginError) {
        const msg = friendlyError(loginError);
        setError(msg);
        if (msg.startsWith('Incorrect')) setFieldError({ email: true, password: true });
      } else {
        const adminEmail = 'iamaryan721@gmail.com';
        if (email.trim().toLowerCase() === adminEmail.toLowerCase()) {
          setError('Admin dashboard is available on the web portal only. This app is for Teachers and Parents.');
          return;
        }
        router.replace('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const onEmailChange = (v: string) => {
    setEmail(v);
    if (error) setError(null);
    if (fieldError.email) setFieldError((f) => ({ ...f, email: false }));
  };
  const onPasswordChange = (v: string) => {
    setPassword(v);
    if (error) setError(null);
    if (fieldError.password) setFieldError((f) => ({ ...f, password: false }));
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Clean subtle light gradient */}
      <LinearGradient
        colors={['#FFFFFF', '#F5F7FA', '#F1F5F9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* Brand Header (No logo) */}
            <View style={styles.brandHeader}>
              <Text style={styles.brandTitle}>Veducore</Text>
              <Text style={styles.brandSubtitle}>Teacher & Parent Mobile Portal</Text>
            </View>

            {/* White Login Card */}
            <View style={styles.glassCard}>
              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSubtitle}>Sign in to manage classes and student records</Text>

              {/* Email Input */}
              <View
                style={[
                  styles.inputField,
                  emailFocused && styles.inputFieldFocused,
                  fieldError.email && styles.inputFieldError,
                ]}>
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={emailFocused ? COLORS.primary : COLORS.textLight}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email, username or parent mobile"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={onEmailChange}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {email.length > 0 && (
                  <TouchableOpacity onPress={() => onEmailChange('')} style={styles.clearBtn}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Password Input */}
              <View
                style={[
                  styles.inputField,
                  passFocused && styles.inputFieldFocused,
                  fieldError.password && styles.inputFieldError,
                ]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={passFocused ? COLORS.primary : COLORS.textLight}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={onPasswordChange}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  secureTextEntry={!showPass}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPass(p => !p)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}>
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              {error && (
                <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Sign In Button */}
              <Button
                label="Sign In to Portal"
                onPress={handleLogin}
                loading={loading}
                loadingLabel="Signing in…"
                fullWidth
                size="lg"
                icon="log-in-outline"
                style={{ marginTop: 6 }}
              />
            </View>

            <Text style={styles.footerText}>
              Veducore · ERP Portal © 2026
            </Text>
            <Text style={styles.versionText}>{VERSION_LABEL}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  safeArea: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    justifyContent: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '600',
  },
  glassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: SPACING.lg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: SPACING.lg,
    lineHeight: 18,
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    height: 48,
  },
  inputFieldFocused: {
    borderColor: '#1E5BD8',
    backgroundColor: '#FFFFFF',
  },
  inputFieldError: {
    borderColor: '#F87171',
    backgroundColor: '#FEF2F2',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
  },
  errorText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
  },
  eyeBtn: {
    padding: 6,
  },
  footerText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: SPACING.xl,
  },
  versionText: {
    textAlign: 'center',
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 4,
  },
});
