import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ha_token';
const USER_KEY  = 'ha_user';

export const storage = {
  getToken:   (): Promise<string | null> => SecureStore.getItemAsync(TOKEN_KEY),
  setToken:   (t: string)  => SecureStore.setItemAsync(TOKEN_KEY, t),
  clearToken: ()           => SecureStore.deleteItemAsync(TOKEN_KEY),

  getUser: async (): Promise<any | null> => {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setUser:   (u: object) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)),
  clearUser: ()          => SecureStore.deleteItemAsync(USER_KEY),

  clearAll: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  getTheme: async (): Promise<'system' | 'light' | 'dark'> => {
    const raw = await SecureStore.getItemAsync('ha_theme');
    return (raw as any) || 'system';
  },
  setTheme: (t: 'system' | 'light' | 'dark') => SecureStore.setItemAsync('ha_theme', t),
};
