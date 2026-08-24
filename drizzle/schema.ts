import { boolean, double, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectName: varchar("projectName", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["draft", "uploading", "ready", "queued", "processing", "completed", "failed"]).default("draft").notNull(),
  currentStage: mysqlEnum("currentStage", ["uploading", "extracting_audio", "detecting_language", "transcribing", "translating", "generating_voice", "synchronizing_audio", "preserving_background", "mixing_audio", "rendering_video", "completed"]).default("uploading").notNull(),
  progressPercent: int("progressPercent").default(0).notNull(),
  statusMessage: text("statusMessage"),
  lastError: text("lastError"),
  originalLanguage: varchar("originalLanguage", { length: 24 }).default("auto").notNull(),
  detectedLanguage: varchar("detectedLanguage", { length: 24 }),
  targetLanguage: varchar("targetLanguage", { length: 24 }).default("Tamil").notNull(),
  dubbingProvider: mysqlEnum("dubbingProvider", ["local", "murf"]).default("local").notNull(),
  murfJobId: varchar("murfJobId", { length: 128 }),
  murfStatus: varchar("murfStatus", { length: 64 }),
  voiceId: varchar("voiceId", { length: 48 }).notNull(),
  voiceStyle: varchar("voiceStyle", { length: 48 }).notNull(),
  terminologyRules: text("terminologyRules"),
  pronunciationRules: text("pronunciationRules"),
  subtitleStyle: mysqlEnum("subtitleStyle", ["minimal", "studio", "high_contrast"]).default("studio").notNull(),
  allowVoiceProviderFallback: boolean("allowVoiceProviderFallback").default(true).notNull(),
  preserveBackgroundAudio: boolean("preserveBackgroundAudio").default(false).notNull(),
  preserveSoundEffects: boolean("preserveSoundEffects").default(false).notNull(),
  generateSubtitles: boolean("generateSubtitles").default(false).notNull(),
  burnSubtitles: boolean("burnSubtitles").default(false).notNull(),
  createSrt: boolean("createSrt").default(false).notNull(),
  audioMode: mysqlEnum("audioMode", ["replace_original", "preserved_background"]).default("replace_original").notNull(),
  copyrightOwnershipConfirmed: boolean("copyrightOwnershipConfirmed").notNull(),
  copyrightResponsibilityConfirmed: boolean("copyrightResponsibilityConfirmed").notNull(),
  sourceFileKey: varchar("sourceFileKey", { length: 512 }),
  sourceFileUrl: varchar("sourceFileUrl", { length: 768 }),
  sourceFilename: varchar("sourceFilename", { length: 255 }),
  sourceMimeType: varchar("sourceMimeType", { length: 120 }),
  sourceFileSizeBytes: int("sourceFileSizeBytes"),
  sourceDurationSeconds: double("sourceDurationSeconds"),
  finalVideoKey: varchar("finalVideoKey", { length: 512 }),
  finalVideoUrl: varchar("finalVideoUrl", { length: 768 }),
  subtitleSrtKey: varchar("subtitleSrtKey", { length: 512 }),
  subtitleSrtUrl: varchar("subtitleSrtUrl", { length: 768 }),
  thumbnailUrl: varchar("thumbnailUrl", { length: 768 }),
  outputDurationSeconds: double("outputDurationSeconds"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("projects_user_updated_idx").on(table.userId, table.updatedAt), index("projects_user_status_idx").on(table.userId, table.status)]);

export const mediaFiles = mysqlTable("mediaFiles", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  role: varchar("role", { length: 48 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 768 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  durationSeconds: double("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("media_project_role_idx").on(table.projectId, table.role)]);

export const processingJobs = mysqlTable("processingJobs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  stage: varchar("stage", { length: 48 }).notNull(),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed"]).default("queued").notNull(),
  progressPercent: int("progressPercent").default(0).notNull(),
  message: text("message").notNull(),
  errorDetail: text("errorDetail"),
  attempt: int("attempt").default(1).notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("jobs_project_created_idx").on(table.projectId, table.createdAt)]);

export const projectSegments = mysqlTable("projectSegments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  sortOrder: int("sortOrder").notNull(),
  startSeconds: double("startSeconds").notNull(),
  endSeconds: double("endSeconds").notNull(),
  sourceText: text("sourceText").notNull(),
  tamilText: text("tamilText"),
  speaker: varchar("speaker", { length: 120 }),
  voiceId: varchar("voiceId", { length: 48 }).notNull(),
  voiceStyle: varchar("voiceStyle", { length: 48 }).notNull(),
  pronunciationHint: varchar("pronunciationHint", { length: 240 }),
  speed: varchar("speed", { length: 8 }).default("1.00").notNull(),
  ttsAudioKey: varchar("ttsAudioKey", { length: 512 }),
  ttsAudioUrl: varchar("ttsAudioUrl", { length: 768 }),
  status: mysqlEnum("status", ["transcribed", "translated", "voiced", "failed"]).default("transcribed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("segments_project_order_idx").on(table.projectId, table.sortOrder)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type InsertMediaFile = typeof mediaFiles.$inferInsert;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = typeof processingJobs.$inferInsert;
export type ProjectSegment = typeof projectSegments.$inferSelect;
export type InsertProjectSegment = typeof projectSegments.$inferInsert;
