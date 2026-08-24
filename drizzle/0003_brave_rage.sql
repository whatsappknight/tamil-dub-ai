ALTER TABLE `projects` ADD `dubbingProvider` enum('local','murf') DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `murfJobId` varchar(128);--> statement-breakpoint
ALTER TABLE `projects` ADD `murfStatus` varchar(64);--> statement-breakpoint
