export type ContentFormat = 'ebook' | 'audio';

export type WorkStatus = 'not_started' | 'in_progress' | 'completed';

export type RightsStatus =
  | 'approved'
  | 'pending'
  | 'blocked'
  | 'public_domain'
  | 'own_content';

export type AssetSourceType = 'google_drive' | 'storage' | 'manual';

export type ProgressType = 'reading' | 'listening';

/**
 * 3. PROFILES
 */
export interface ProfileRecord {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  daily_minutes: number;
  preferred_format: 'Lendo' | 'Ouvindo' | 'Os dois';
  onboarding_completed: boolean;
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * 4. INTERESTS & USER_INTERESTS
 */
export interface InterestRecord {
  id: string;
  slug: string;
  name: string;
}

export interface UserInterestRecord {
  user_id: string;
  interest_id: string;
  created_at?: unknown;
}

/**
 * 5. AUTHORS
 */
export interface AuthorRecord {
  id: string;
  name: string;
  slug: string;
  created_at?: unknown;
}

/**
 * 6. CATEGORIES & 9. WORK_CATEGORIES
 */
export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  created_at?: unknown;
}

export interface WorkCategoryRecord {
  work_id: string;
  category_id: string;
}

/**
 * 10. TAGS & WORK_TAGS
 */
export interface TagRecord {
  id: string;
  name: string;
  slug: string;
}

export interface WorkTagRecord {
  work_id: string;
  tag_id: string;
}

/**
 * 7. WORKS
 */
export interface WorkRecord {
  id: string;
  title: string;
  slug: string;
  author_id: string;
  description: string;
  cover_url: string;
  language: string;
  status: 'published' | 'draft' | 'archived';
  rights_status: RightsStatus;
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * 8. ASSETS
 */
export interface AssetRecord {
  id: string;
  work_id: string;
  asset_type: ContentFormat;
  source_type: AssetSourceType;
  drive_file_id: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  duration_seconds: number;
  checksum: string;
  status: 'active' | 'inactive' | 'processing';
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * 11. FAVORITES
 */
export interface FavoriteRecord {
  user_id: string;
  work_id: string;
  created_at?: unknown;
}

/**
 * 12. USER_PROGRESS
 */
export interface UserProgressRecord {
  id: string;
  user_id: string;
  work_id: string;
  asset_id: string;
  progress_type: ProgressType;
  progress_percent: number;
  position: number;
  total_pages?: number;
  completed: boolean;
  last_accessed_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * ASSET = Arquivo/Formato individual vinculado a uma Obra (WORK) na UI
 */
export interface WorkAsset {
  id: string;
  workId: string;
  format: ContentFormat;
  mimeType:
    | 'application/pdf'
    | 'application/epub+zip'
    | 'audio/mpeg'
    | 'audio/mp4'
    | 'audio/x-m4a';
  durationOrPages: string;
  durationMinutes: number;
  sourceType?: AssetSourceType;
  driveFileId?: string;
  storagePath?: string;
  fileSize?: number;
  durationSeconds?: number;
  checksum?: string;
  status?: 'active' | 'inactive' | 'processing' | 'pending';
}

/**
 * WORK = Obra intelectual única na UI (pode conter 1 ou múltiplos ASSETS: ebook, audio, ou ambos)
 */
export interface Work {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  author: string;
  authorId?: string;
  cover?: string;
  coverTheme: {
    primaryColor: string;
    secondaryColor: string;
    accentHex: string;
    motif: 'rings' | 'prism' | 'arch' | 'scroll' | 'wave' | 'compass' | 'nexus' | 'monolith';
  };
  description: string;
  language?: string;
  dbStatus?: 'published' | 'draft' | 'archived';
  rightsStatus?: RightsStatus;
  categories: string[];
  tags: string[];
  benefits: string[];
  availableFormats: ContentFormat[];
  assets: WorkAsset[];
  progress: number; // 0 a 100
  position?: number;
  totalPages?: number;
  lastAccessedAt?: string;
  progressType?: ProgressType;
  duration: string;
  status: WorkStatus;
  isSaved: boolean;
  featured?: boolean;
  relatedGoalIds: string[];
}

export interface GoalItem {
  id: string;
  label: string;
  statement: string;
  description: string;
  accentColor: 'cyan' | 'amber' | 'emerald' | 'indigo' | 'sky';
  recommendedWorkIds: string[];
}

export interface CategoryItem {
  id: string;
  name: string;
  subtitle: string;
  countLabel: string;
}

export interface OnboardingPreferences {
  interests: string[];
  dailyTime: string;
  dailyMinutes?: number;
  preferredFormat: 'Lendo' | 'Ouvindo' | 'Os dois';
  onboardingCompleted?: boolean;
  completedAt?: string;
}

export interface AuthenticatedUser {
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  emailVerified: boolean;
  isCloudBacked: boolean;
}

export type ActiveTab = 'home' | 'explore' | 'trail' | 'library' | 'my-list' | 'profile';
export type AppScreen = 'splash' | 'auth' | 'onboarding' | 'main';

/**
 * FASE 14 — TIPOS DE ASSINATURA E PLANOS (AGNÓSTICOS DE GATEWAY)
 */
export type SubscriptionStatusType =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'refunded'
  | 'chargeback';

export type SubscriptionAccessTier = 'free' | 'premium';

export type SubscriptionProviderName =
  | 'kiwify'
  | 'hotmart'
  | 'kirvano'
  | 'eduzz'
  | 'stripe'
  | 'manual'
  | 'other'
  | null;

export interface SubscriptionPlanItem {
  id: string;
  code: string;
  name: string;
  description: string;
  accessTier: SubscriptionAccessTier;
  billingInterval: 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'lifetime';
  isActive: boolean;
  checkoutEnabled: boolean;
  features: string[];
}

export interface UserSubscriptionGatewayFields {
  providerName: SubscriptionProviderName;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  externalOrderId: string | null;
  externalProductId: string | null;
  externalOfferId: string | null;
  providerStatus: string | null;
}

export interface UserSubscriptionSummary {
  userId: string;
  hasSubscriptionRecord: boolean;
  hasActivePremium: boolean;
  planCode: string;
  planName: string;
  planDescription: string;
  status: SubscriptionStatusType;
  statusLabel: string;
  accessTier: SubscriptionAccessTier;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  validityLabel: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  checkoutEnabled: boolean;
  checkoutNotice: string;
  gateway: UserSubscriptionGatewayFields;
  availablePlans: SubscriptionPlanItem[];
  storageMode: 'supabase_tables' | 'supabase_private_bucket';
  updatedAt: string | null;
}

