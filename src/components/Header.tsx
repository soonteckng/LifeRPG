import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Href, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  backTitle?: string;
  fallbackRoute?: string;
  backgroundColor?: string;
}

export default function Header({ 
  title, 
  subtitle, 
  showBack = true,
  backTitle = 'Home',
  fallbackRoute = '/profile',
  backgroundColor = '#090D16',
}: HeaderProps) {
  const router = useRouter();
  const { hapticsEnabled } = useUser();

  const handleBack = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as Href);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {showBack && (
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backText}>{backTitle}</Text>
        </TouchableOpacity>
      )}

      {title && (
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 12,
  },
  backChevron: { color: '#7EA2FF', fontSize: 20, fontWeight: 'bold', marginTop: -2 },
  backText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  titleGroup: { gap: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: '#9CA8BC', fontSize: 13, marginTop: 3 },
});