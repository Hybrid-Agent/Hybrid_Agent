export type RootStackParamList = {
  Cover: undefined;
  Login: undefined;
  Register: undefined;
  Main: undefined;
  CreateListing: undefined;
  Wallet: undefined;
  KYC: undefined;
  EscrowConfirm: { listingId: string };
  OwnerWithdraw: { escrowId?: string };
  Notifications: undefined;
  PersonalDetails: undefined;
  Chat: { conversationId: string };
};

export type ListingsStackParamList = {
  ListingsFeed: undefined;
  ListingDetail: { id: string };
};

export type TabParamList = {
  Home: undefined;
  ListingsTab: undefined;
  Activity: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};
