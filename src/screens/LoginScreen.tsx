// Login screen - always uses the dark gradient (not affected by theme toggle)
import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../navigation/AuthNavigator';
import { useAuth } from '../context/AuthContext';
import { darkColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { TextFieldInput } from '../components/TextFieldInput';
import { Button } from '../components/Button';

// auth screens always use dark colors - user hasn't logged in yet to have a preference
const c = darkColors;

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);

  const handleLogin = async () => {
    setError('');
    setUnverified(false);
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = (err as Error).message;
      if ((err as any).status === 403) {
        setError(msg);
        setUnverified(true);
      } else {
        setError(msg || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[c.gradientStart, c.gradientMid, c.gradientEnd]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>EdgeMarket</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>

            <TextFieldInput
              label="Email"
              value={email}
              onChangeText={t => { setEmail(t); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />
            <TextFieldInput
              label="Password"
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              secureTextEntry
              editable={!loading}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {unverified && (
              <Button
                variant="secondary"
                size="md"
                onPress={() => navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() })}
                style={{ marginBottom: 8 }}
              >
                Resend verification code
              </Button>
            )}

            <Button
              variant="primary"
              size="lg"
              loading={loading}
              onPress={handleLogin}
              style={{ marginTop: 8 }}
            >
              Sign In
            </Button>

            <Pressable onPress={() => navigation.navigate('Signup')} style={styles.link}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
              </Text>
            </Pressable>
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
  title: { color: '#fff', fontSize: 32, fontFamily: fonts.bold, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 32, textAlign: 'center' },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  link: { marginTop: 24, alignItems: 'center' },
  linkText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  linkBold: { color: c.purple, fontFamily: fonts.semiBold, fontWeight: '600' },
});
