import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { api, type AuthUser } from '../lib/api';
import { getSocket } from '../lib/socket';
import { storage } from '../lib/storage';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type Theme } from '../lib/theme';

const TEAL = '#0d9488';

type ChatScreenRouteProp = RouteProp<RootStackParamList, 'Chat'>;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const route = useRoute<ChatScreenRouteProp>();
  const { conversationId } = route.params;
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    storage.getUser().then(u => { if (u) setUser(u); });
    api.me().then(({ user: u }) => setUser(u)).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    api.messages(conversationId).then(history => {
      if (active) {
        setMessages(history);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });

    let socket: any = null;
    getSocket().then(s => {
      socket = s;
      if (!active) return;
      socket.emit('conversation:join', conversationId, () => {});

      socket.on('message:new', (m: any) => {
        if (m.conversation_id === conversationId) {
          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev;
            return [...prev, m];
          });
        }
      });
    });

    return () => {
      active = false;
      if (socket) {
        socket.emit('conversation:leave', conversationId);
        socket.off('message:new');
      }
    };
  }, [conversationId]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    
    setText(''); // optimistic clear
    getSocket().then(socket => {
      socket.emit('message:send', { conversationId, body }, (ack: any) => {
        if (!ack?.ok) {
          // Could handle error or revert text
        }
      });
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === user?.id;
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
          {!isMine && <Text style={styles.senderName}>{item.sender_name}</Text>}
          <Text style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>{item.body}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.background === '#121212' ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={theme.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>

      {/* Safety Notice */}
      <View style={styles.safetyBox}>
        <Ionicons name="warning" size={14} color="#92400e" style={{ marginTop: 2 }} />
        <Text style={styles.safetyText}>
          Keep all chats & payments on HybridAgent. Never deal off-platform.
        </Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            !loading ? <Text style={styles.emptyText}>No messages yet. Say hello 👋</Text> : null
          }
        />

        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor="#9ca3af"
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]} 
            onPress={send}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.border
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.navy },
  safetyBox: {
    flexDirection: 'row', backgroundColor: theme.badgePendingBg,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.border, gap: 8
  },
  safetyText: { flex: 1, fontSize: 12, color: theme.badgePendingText, lineHeight: 16 },
  listContent: { padding: 16, gap: 12, flexGrow: 1, justifyContent: 'flex-end' },
  msgRow: { flexDirection: 'row', width: '100%' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgBubble: {
    maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18
  },
  msgBubbleMine: {
    backgroundColor: TEAL,
    borderBottomRightRadius: 4,
  },
  msgBubbleTheirs: {
    backgroundColor: theme.background === '#121212' ? '#2c2c2c' : '#f3f4f6',
    borderBottomLeftRadius: 4,
  },
  senderName: { fontSize: 11, fontWeight: '600', color: TEAL, marginBottom: 4 },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgTextMine: { color: '#fff' },
  msgTextTheirs: { color: theme.text },
  emptyText: { textAlign: 'center', color: theme.textSecondary, marginTop: 40, fontSize: 14 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: theme.border,
    backgroundColor: theme.card, gap: 10
  },
  input: {
    flex: 1, backgroundColor: theme.inputBg,
    borderRadius: 20, paddingHorizontal: 16,
    paddingTop: 12, paddingBottom: 12,
    minHeight: 40, maxHeight: 100,
    fontSize: 15, color: theme.text,
    borderWidth: 1, borderColor: theme.border
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: TEAL,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2
  },
  sendBtnDisabled: { opacity: 0.5 }
});
