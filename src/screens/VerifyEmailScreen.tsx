// Verify email screen - user enters the 6-digit code sent to their email
import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../navigation/AuthNavigator';
import { useAuth } from '../context/AuthContext';
import { darkColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { TextFieldInput } from '../components/TextFieldInput';
import { Button } from '../components/Button';

const c = darkColors;

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

export function VerifyEmailScreen({ route }: Props) {
  const { email } = route.params;
  const { verifyEmail, resendCode } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  const handleVerify = async () => {
    setError('');
    setResendMsg('');
    if (code.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      await verifyEmail(email, code);
    } catch (err) {
      setError((err as Error).message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResendMsg('');
    setResending(true);
    try {
      await resendCode(email);
      setResendMsg('A new code has been sent to your email.');
    } catch (err) {
      setError((err as Error).message || 'Resend failed. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const truncatedEmail = email.length > 28 ? email.slice(0, 14) + '…' + email.slice(-8) : email;

  return (
    <LinearGradient
      colors={[c.gradientStart, c.gradientMid, c.gradientEnd]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.emailHighlight}>{truncatedEmail}</Text>
            </Text>

            <TextFieldInput
              label="Verification code"
              value={code}
              onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
              style={{ fontSize: 28, letterSpacing: 12, textAlign: 'center', fontFamily: fonts.bold, fontWeight: '700' }}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {resendMsg ? <Text style={styles.success}>{resendMsg}</Text> : null}

            <Button variant="primary" size="lg" loading={loading} onPress={handleVerify} style={{ marginTop: 8 }}>
              Verify
            </Button>

            <Button variant="secondary" size="md" loading={resending} disabled={resending || loading} onPress={handleResend} style={{ marginTop: 12 }}>
              Resend code
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  title: { color: '#fff', fontSize: 28, fontFamily: fonts.bold, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 32, textAlign: 'center', lineHeight: 22 },
  emailHighlight: { color: c.purple, fontFamily: fonts.semiBold, fontWeight: '600' },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  success: { color: '#4ade80', fontSize: 13, marginBottom: 12, textAlign: 'center' },
});
