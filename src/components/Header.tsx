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
  container: { marginBottom: 16, width: '100%' },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 12,
  },
  backChevron: { color: '#6366F1', fontSize: 20, fontWeight: 'bold', marginTop: -2 },
  backText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  titleGroup: { gap: 2 },
  title: { color: '#F8FAFC', fontSize: 26, fontWeight: 'bold' },
  subtitle: { color: '#94A3B8', fontSize: 13 },
});