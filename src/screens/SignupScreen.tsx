// Signup screen - always uses dark gradient (auth screens don't use theme toggle)
import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet,
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

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    setError('');
    if (name.trim() === '') { setNameError('Name is required'); return; }
    if (name.trim().length > 100) { setNameError('Name must be 100 characters or fewer'); return; }
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), password, name.trim());
      navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() });
    } catch (err) {
      setError((err as Error).message || 'Signup failed. Please try again.');
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
            <Text style={styles.subtitle}>Create your account</Text>

            <TextFieldInput
              label="Your name"
              value={name}
              onChangeText={t => { setName(t); setNameError(null); }}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!loading}
              error={nameError}
            />

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
              label="Password (min 8 characters)"
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              secureTextEntry
              editable={!loading}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button variant="primary" size="lg" loading={loading} onPress={handleSignup} style={{ marginTop: 8 }}>
              Create Account
            </Button>

            <Pressable onPress={() => navigation.navigate('Login')} style={styles.link}>
              <Text style={styles.linkText}>
                Already have an account? <Text style={styles.linkBold}>Sign in</Text>
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
