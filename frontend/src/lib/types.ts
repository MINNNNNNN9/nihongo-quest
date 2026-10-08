export interface Progress {
  level: number;
  title: string;
  total_exp: number;
  exp_into_level: number;
  exp_for_next_level: number;
}

export interface Profile {
  username: string;
  email: string;
  display_name: string;
  show_on_leaderboard: boolean;
  total_exp: number;
  progress: Progress;
  created_at: string;
}

export interface Game {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  controls: string;
  bundle_path: string;
  adapter_path: string;
  scratch_project_id: string;
  levels_total: number;
  levels_cleared: number;
  last_played_at: string | null;
}

export interface GameDetail extends Game {
  question_count: number;
  topics: { topic: string; label: string; questions: number }[];
}

export interface GameLevel {
  key: string;
  order: number;
  chapter: number;
  title: string;
  kind: 'stage' | 'boss';
  questions_required: number;
  exp_reward: number;
  cleared: boolean;
  clear_count: number;
}

export type SessionStatus = 'in_progress' | 'cleared' | 'failed' | 'abandoned';

export interface GameSession {
  id: string;
  game: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  answer_score: number | null;
  battle_score: number | null;
  total_score: number | null;
}

export interface Reward {
  exp_awarded: number;
  is_first_clear: boolean;
  leveled_up: boolean;
  level_before: number;
  progress: Progress;
}

export interface EventResult {
  duplicate: boolean;
  is_correct: boolean | null;
  reward: Reward | null;
}

export interface Dashboard {
  progress: Progress;
  total_sessions: number;
  cleared_sessions: number;
  total_seconds: number;
  questions_answered: number;
  accuracy: number | null;
  topics: { topic: string; label: string; attempts: number; correct: number; accuracy: number | null }[];
  levels: {
    game: string;
    key: string;
    title: string;
    attempts: number;
    clears: number;
    completion_rate: number | null;
  }[];
  most_missed: {
    key: string;
    prompt: string;
    context: string;
    hint_zh: string;
    correct_answer: string;
    topic_label: string;
    wrong: number;
    attempts: number;
  }[];
  exp_history: { date: string; gained: number; total: number }[];
  recent_sessions: {
    id: string;
    game_title: string;
    status: SessionStatus;
    started_at: string;
    ended_at: string | null;
    total_score: number | null;
    levels_cleared: number;
  }[];
}

export interface LeaderboardEntry {
  rank: number;
  display_name: string;
  level: number;
  value: number;
  is_me: boolean;
}

export interface Leaderboard {
  board: 'exp' | 'score';
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  hidden: boolean;
}

export interface Paginated<T> {
  count: number;
  page: number;
  pages: number;
  results: T[];
}

export interface ExperienceEntry {
  id: number;
  amount: number;
  reason: string;
  reason_label: string;
  game_title: string | null;
  level_title: string | null;
  is_first_clear: boolean | null;
  created_at: string;
}
