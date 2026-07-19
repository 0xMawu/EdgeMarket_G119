// PremiumPaywallModal - shown when a basic user tries to use a premium feature
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Crown, CheckCircle } from 'lucide-react-native';
import { fonts } from '../theme/fonts';
import { API_PREFIX } from '../config/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  jwt: string | null;
  onPaymentComplete?: () => Promise<void>;
}

// poll /api/auth/me every 3 seconds until isPremium is true or we hit maxAttempts
async function pollForPremium(jwt: string, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const res = await fetch(`${API_PREFIX}/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isPremium === true) return true;
      }
    } catch {
      // network blip - keep trying
    }
  }
  return false;
}

export function PremiumPaywallModal({ visible, onClose, jwt, onPaymentComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    if (!jwt) { setError('Please sign in to subscribe.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_PREFIX}/subscription/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Unable to start checkout. Please try again.');
        return;
      }
      const { url } = await res.json() as { url: string };
      if (!url) { setError('Unable to start checkout. Please try again.'); return; }

      // open Paystack payment page - result contains the redirect URL with reference
      const result = await WebBrowser.openAuthSessionAsync(url, 'edgemarket://subscription/success');

      setLoading(false);
      setPolling(true);

      // try direct verification first using the reference from callback URL
      let upgraded = false;
      if (result.type === 'success' && result.url) {
        try {
          const callbackUrl = new URL(result.url);
          const reference = callbackUrl.searchParams.get('reference') || callbackUrl.searchParams.get('trxref');
          if (reference) {
            const verifyRes = await fetch(`${API_PREFIX}/subscription/verify?reference=${reference}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${jwt}` },
            });
            if (verifyRes.ok) {
              const verifyData = await verifyRes.json() as { upgraded: boolean };
              upgraded = verifyData.upgraded === true;
            }
          }
        } catch {
          // reference extraction failed - fall through to polling
        }
      }

      // if direct verify didn't work, poll /auth/me until isPremium is true
      if (!upgraded) {
        upgraded = await pollForPremium(jwt);
      }

      if (upgraded) {
        setSuccess(true);
        setPolling(false);
        if (onPaymentComplete) await onPaymentComplete();
        setTimeout(() => { setSuccess(false); onClose(); }, 2000);
      } else {
        setPolling(false);
        setError('Payment received but upgrade is taking longer than expected. Please restart the app.');
        if (onPaymentComplete) await onPaymentComplete();
      }
    } catch {
      setError('Unable to start checkout. Please try again.');
      setLoading(false);
      setPolling(false);
    }
  };

  const handleClose = () => { setError(null); setSuccess(false); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={[styles.iconWrap, success && styles.iconWrapSuccess]}>
            {success
              ? <CheckCircle size={28} color="#4ade80" />
              : <Crown size={28} color="#eab308" />}
          </View>

          {success ? (
            <>
              <Text style={styles.headline}>You're Premium! 🎉</Text>
              <Text style={styles.successText}>Your account has been upgraded.</Text>
            </>
          ) : (
            <>
              <Text style={styles.headline}>Go Premium – $15/month</Text>
              <View style={styles.benefits}>
                <Text style={styles.benefit}>• Up to 50 open positions per wallet</Text>
                <Text style={styles.benefit}>• Full copy trading access</Text>
                <Text style={styles.benefit}>• Powered by Paystack — secure &amp; fast</Text>
              </View>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {polling && (
            <View style={styles.pollingWrap}>
              <ActivityIndicator color="#eab308" size="small" />
              <Text style={styles.pollingText}>Confirming your payment...</Text>
            </View>
          )}

          {!polling && !success && (
            <Pressable
              style={[styles.subscribeBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubscribe}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#1a1a2e" size="small" />
                : <Text style={styles.subscribeBtnText}>Subscribe with Paystack</Text>}
            </Pressable>
          )}

          {!polling && !success && (
            <Pressable style={{ paddingVertical: 10 }} onPress={handleClose}>
              <Text style={styles.notNowText}>Not now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  box: {
    width: '100%', backgroundColor: '#1a1a2e',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)',
    padding: 24, alignItems: 'center',
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(234,179,8,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  iconWrapSuccess: {
    backgroundColor: 'rgba(74,222,128,0.15)',
  },
  headline: { color: '#fff', fontSize: 20, fontFamily: fonts.bold, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  successText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center' },
  benefits: { alignSelf: 'stretch', marginBottom: 20, gap: 8 },
  benefit: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 22 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  pollingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  pollingText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  subscribeBtn: {
    alignSelf: 'stretch', backgroundColor: '#eab308',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  subscribeBtnText: { color: '#1a1a2e', fontSize: 15, fontFamily: fonts.bold, fontWeight: '700' },
  notNowText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: fonts.medium, fontWeight: '500' },
});
