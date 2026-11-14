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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/lib/utils';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter your email and password to continue.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await login(email.trim(), password);
      if (error) {
        Alert.alert('Login Failed', error);
      } else {
        const adminEmail = 'iamaryan721@gmail.com';
        if (email.trim().toLowerCase() === adminEmail.toLowerCase()) {
          Alert.alert(
            'Web Portal Required',
            'The Administrator dashboard is optimized for desktop web browsers. Mobile app is tailored for Teachers and Parents.'
          );
          return;
        }
        router.replace('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Clean subtle light gradient */}
      <LinearGradient
        colors={['#FFFFFF', '#F4F5FB', '#F1F5F9']}
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
                ]}>
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={emailFocused ? COLORS.primary : COLORS.textLight}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {email.length > 0 && (
                  <TouchableOpacity onPress={() => setEmail('')} style={styles.clearBtn}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Password Input */}
              <View
                style={[
                  styles.inputField,
                  passFocused && styles.inputFieldFocused,
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
                  onChangeText={setPassword}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  secureTextEntry={!showPass}
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

              {/* Sign In Button */}
              <Button
                label="Sign In to Portal"
                onPress={handleLogin}
                loading={loading}
                fullWidth
                size="lg"
                icon="log-in-outline"
                style={{ marginTop: 6 }}
              />
            </View>

            <Text style={styles.footerText}>
              Veducore · ERP Portal © 2026
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F5FB',
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
    backgroundColor: '#F4F5FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    height: 48,
  },
  inputFieldFocused: {
    borderColor: '#5B6EE8',
    backgroundColor: '#FFFFFF',
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
});
