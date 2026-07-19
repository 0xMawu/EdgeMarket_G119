// PremiumPaywallModal - shown when a basic user tries to use a premium feature
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Crown } from 'lucide-react-native';
import { fonts } from '../theme/fonts';
import { API_PREFIX } from '../config/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  jwt: string | null;
}

export function PremiumPaywallModal({ visible, onClose, jwt }: Props) {
  const [loading, setLoading] = useState(false);
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
      await WebBrowser.openAuthSessionAsync(url, 'edgemarket://subscription/success');
    } catch {
      setError('Unable to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setError(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.iconWrap}>
            <Crown size={28} color="#eab308" />
          </View>

          <Text style={styles.headline}>Go Premium – $15/month</Text>

          <View style={styles.benefits}>
            <Text style={styles.benefit}>• Up to 50 open positions per wallet</Text>
            <Text style={styles.benefit}>• Full copy trading access</Text>
            <Text style={styles.benefit}>• Powered by Paystack — secure &amp; fast</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.subscribeBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubscribe}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#1a1a2e" size="small" />
              : <Text style={styles.subscribeBtnText}>Subscribe with Paystack</Text>}
          </Pressable>

          <Pressable style={{ paddingVertical: 10 }} onPress={handleClose}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
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
  headline: { color: '#fff', fontSize: 20, fontFamily: fonts.bold, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  benefits: { alignSelf: 'stretch', marginBottom: 20, gap: 8 },
  benefit: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 22 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  subscribeBtn: {
    alignSelf: 'stretch', backgroundColor: '#eab308',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  subscribeBtnText: { color: '#1a1a2e', fontSize: 15, fontFamily: fonts.bold, fontWeight: '700' },
  notNowText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: fonts.medium, fontWeight: '500' },
});
