import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  fallbackRoute?: string;
  backTitle?: string;
  onBack?: () => void;
  backgroundColor?: string;
}

export default function Header({ 
  title, 
  subtitle, 
  showBack = true,
  fallbackRoute = '/',
  backTitle = 'Back',
  onBack,
  backgroundColor = '#090D16', // Matched exactly to app background
}: HeaderProps) {
  const router = useRouter();
  const { hapticsEnabled } = useUser();

  const handleBack = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (onBack) {
      onBack();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as any);
    }
  };

  return (
    <View style={[styles.headerContainer, { backgroundColor }]}>
      {/* iOS Style Back Button */}
      {showBack && (
        <View style={styles.navBar}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={handleBack}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.backText}>{backTitle}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Large Title Text */}
      {title && (
        <View style={styles.titleGroup}>
          <Text style={styles.titleText}>{title}</Text>
          {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
    paddingBottom: 12,
    width: '100%',
    // No borders, lines, or shadows - blends naturally into page background
  },
  navBar: {
    height: 36,
    justifyContent: 'center',
    marginBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -4,
  },
  backChevron: {
    color: '#818CF8',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 34,
    marginRight: 2,
    marginTop: Platform.OS === 'ios' ? -2 : -4,
  },
  backText: {
    color: '#818CF8',
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.41,
  },
  titleGroup: {
    marginTop: 2,
    gap: 2,
  },
  titleText: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.38,
    lineHeight: 34,
  },
  subtitleText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: -0.08,
  },
});