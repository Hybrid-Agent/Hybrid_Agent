import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { getSocket } from '../lib/socket';
import { storage } from '../lib/storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme, type Theme } from '../lib/theme';

export default function GlobalNotifier() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [toast, setToast] = useState<{ id: string, title: string, body: string, conversationId: string } | null>(null);
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout;

    const setupSocket = async () => {
      const user = await storage.getUser();
      if (!user) return;
      
      try {
        const socket = await getSocket();
        
        socket.on('message:notify', ({ conversationId, message }) => {
          if (!active) return;
          // Show toast
          setToast({
            id: Date.now().toString(),
            title: `New message from ${message.sender_name || 'a user'}`,
            body: message.body,
            conversationId
          });
          
          Animated.spring(slideAnim, {
            toValue: insets.top + 10,
            useNativeDriver: true,
            speed: 14,
            bounciness: 6
          }).start();
          
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            closeToast();
          }, 4000);
        });
      } catch (err) {}
    };

    setupSocket();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      getSocket().then(s => s.off('message:notify')).catch(() => {});
    };
  }, [insets.top]);

  const closeToast = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true
    }).start(() => setToast(null));
  };

  if (!toast) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity 
        style={styles.toast}
        activeOpacity={0.9}
        onPress={() => {
          closeToast();
          nav.navigate('Chat', { conversationId: toast.conversationId });
        }}
      >
        <View style={styles.iconBox}>
          <Ionicons name="chatbubble-outline" size={20} color={theme.navy} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{toast.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{toast.body}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={closeToast}>
          <Ionicons name="close" size={18} color="#9ca3af" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
  },
  toast: {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  }
});
