CREATE TABLE `sync_records` (
	`owner` text NOT NULL,
	`record_key` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`last_op` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `record_key`)
);
