import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  fallbackRoute?: string;
}

export default function Header({ 
  title, 
  subtitle, 
  showBack = true,
  fallbackRoute = '/profile'
}: HeaderProps) {
  const router = useRouter();
  const { hapticsEnabled } = useUser();

  const handleBack = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.navigate(fallbackRoute as any);
  };

  return (
    <View style={styles.container}>
      {showBack && (
        <TouchableOpacity style={styles.backPill} onPress={handleBack}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backText}>Back</Text>
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
  container: { marginBottom: 22, width: '100%' },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
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