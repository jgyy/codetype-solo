ALTER TABLE `topic_mastery` ADD `ease` real DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE `topic_mastery` ADD `interval_days` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topic_mastery` ADD `repetitions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topic_mastery` ADD `next_review_at` integer;