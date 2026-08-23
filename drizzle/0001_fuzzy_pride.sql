CREATE TABLE `mediaFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`role` varchar(48) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`url` varchar(768) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`durationSeconds` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mediaFiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processingJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stage` varchar(48) NOT NULL,
	`status` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`progressPercent` int NOT NULL DEFAULT 0,
	`message` text NOT NULL,
	`errorDetail` text,
	`attempt` int NOT NULL DEFAULT 1,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processingJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projectSegments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`startSeconds` double NOT NULL,
	`endSeconds` double NOT NULL,
	`sourceText` text NOT NULL,
	`tamilText` text,
	`speaker` varchar(120),
	`voiceId` varchar(48) NOT NULL,
	`voiceStyle` varchar(48) NOT NULL,
	`speed` varchar(8) NOT NULL DEFAULT '1.00',
	`ttsAudioKey` varchar(512),
	`ttsAudioUrl` varchar(768),
	`status` enum('transcribed','translated','voiced','failed') NOT NULL DEFAULT 'transcribed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projectSegments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectName` varchar(160) NOT NULL,
	`status` enum('draft','uploading','ready','queued','processing','completed','failed') NOT NULL DEFAULT 'draft',
	`currentStage` enum('uploading','extracting_audio','detecting_language','transcribing','translating','generating_voice','synchronizing_audio','preserving_background','mixing_audio','rendering_video','completed') NOT NULL DEFAULT 'uploading',
	`progressPercent` int NOT NULL DEFAULT 0,
	`statusMessage` text,
	`lastError` text,
	`originalLanguage` varchar(24) NOT NULL DEFAULT 'auto',
	`detectedLanguage` varchar(24),
	`targetLanguage` varchar(24) NOT NULL DEFAULT 'Tamil',
	`voiceId` varchar(48) NOT NULL,
	`voiceStyle` varchar(48) NOT NULL,
	`preserveBackgroundAudio` boolean NOT NULL DEFAULT false,
	`preserveSoundEffects` boolean NOT NULL DEFAULT false,
	`generateSubtitles` boolean NOT NULL DEFAULT false,
	`burnSubtitles` boolean NOT NULL DEFAULT false,
	`createSrt` boolean NOT NULL DEFAULT false,
	`audioMode` enum('replace_original','preserved_background') NOT NULL DEFAULT 'replace_original',
	`copyrightOwnershipConfirmed` boolean NOT NULL,
	`copyrightResponsibilityConfirmed` boolean NOT NULL,
	`sourceFileKey` varchar(512),
	`sourceFileUrl` varchar(768),
	`sourceFilename` varchar(255),
	`sourceMimeType` varchar(120),
	`sourceFileSizeBytes` int,
	`sourceDurationSeconds` double,
	`finalVideoKey` varchar(512),
	`finalVideoUrl` varchar(768),
	`subtitleSrtKey` varchar(512),
	`subtitleSrtUrl` varchar(768),
	`thumbnailUrl` varchar(768),
	`outputDurationSeconds` double,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `media_project_role_idx` ON `mediaFiles` (`projectId`,`role`);--> statement-breakpoint
CREATE INDEX `jobs_project_created_idx` ON `processingJobs` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `segments_project_order_idx` ON `projectSegments` (`projectId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `projects_user_updated_idx` ON `projects` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `projects_user_status_idx` ON `projects` (`userId`,`status`);