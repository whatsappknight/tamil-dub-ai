ALTER TABLE `projectSegments` ADD `pronunciationHint` varchar(240);--> statement-breakpoint
ALTER TABLE `projects` ADD `terminologyRules` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `pronunciationRules` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `subtitleStyle` enum('minimal','studio','high_contrast') DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `allowVoiceProviderFallback` boolean DEFAULT true NOT NULL;