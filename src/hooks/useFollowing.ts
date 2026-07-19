/**
 * useFollowing — module-level state with AsyncStorage persistence.
 *
 * Follow lists are scoped per user account. The storage key is namespaced
 * by the logged-in user's ID (email-auth UUID or wallet address) so that
 * switching accounts gives each user their own independent follow list.
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_PREFIX } from '../config/api';
import { apiRequest } from '../utils/apiClient';

// Module-level state — persists across screen navigations within a session
let _followingIds: string[] = [];
let _userAddress: string | null = null;
let _userId: string | null = null;           // email-auth user ID (UUID or email)
let _getJwt: (() => string | null) = () => null;
let _onUnauthorized: () => Promise<void> = async () => {};
let _loaded = false;
let _listeners: Array<() => void> = [];

function storageKey(): string {
  // Use user ID if available, fall back to wallet address, then generic key
  const id = _userId ?? _userAddress ?? 'anonymous';
  return `@edgemarket/following_ids/${id}`;
}

function notify() {
  _listeners.forEach((fn) => fn());
}

function saveLocal(ids: string[]) {
  AsyncStorage.setItem(storageKey(), JSON.stringify(ids)).catch(() => {});
}

async function loadLocal() {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await AsyncStorage.getItem(storageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _followingIds = parsed;
        notify();
      }
    }
  } catch {
    // storage unavailable — start with empty list
  }
}

/**
 * Called when the logged-in user changes (login / logout).
 * Resets in-memory state and reloads from the new user's storage slot.
 */
export function setFollowingUserId(userId: string | null) {
  if (_userId === userId) return; // no change
  _userId = userId;
  // Reset state for the new user
  _followingIds = [];
  _loaded = false;
  notify();
  if (userId) {
    loadLocal(); // load new user's follows immediately
  }
}

/** Called from ProfileScreen once a wallet address is known. */
export function setFollowingUserAddress(address: string | null) {
  _userAddress = address;
}

export function setFollowingAuth(getJwt: () => string | null, onUnauthorized: () => Promise<void>) {
  _getJwt = getJwt;
  _onUnauthorized = onUnauthorized;
}

export function useFollowing() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const handler = () => forceRender((n) => n + 1);
    _listeners.push(handler);
    loadLocal();
    return () => {
      _listeners = _listeners.filter((l) => l !== handler);
    };
  }, []);

  const syncFromServer = (addresses: string[]) => {
    const normalised = addresses.map((a) => a.toLowerCase());
    _followingIds = normalised;
    saveLocal(normalised);
    notify();
  };

  const toggleFollow = (id: string) => {
    const normalised = id.toLowerCase();
    const isFollowing = _followingIds.includes(normalised);

    const updated = isFollowing
      ? _followingIds.filter((x) => x !== normalised)
      : [..._followingIds, normalised];

    _followingIds = updated;
    saveLocal(updated);
    notify();

    if (_userAddress) {
      const method = isFollowing ? 'DELETE' : 'POST';
      apiRequest(
        `${API_PREFIX}/follows`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAddress: _userAddress, targetAddress: normalised }),
        },
        _getJwt,
        _onUnauthorized,
      ).catch(() => {});
    }
  };

  return {
    followingIds: _followingIds,
    toggleFollow,
    syncFromServer,
  };
}
