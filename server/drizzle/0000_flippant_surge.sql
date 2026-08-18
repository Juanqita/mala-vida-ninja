CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"play_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"session_id" uuid,
	"score" integer NOT NULL,
	"combo_max" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"items_cut" integer DEFAULT 0 NOT NULL,
	"bombs_hit" integer DEFAULT 0 NOT NULL,
	"ended_by_bomb" boolean DEFAULT false NOT NULL,
	"play_date" date NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "prize_stock_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_date" date NOT NULL,
	"prize_key" text NOT NULL,
	"stock_limit" integer NOT NULL,
	"issued" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prizes" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"emoji" text DEFAULT '🎁' NOT NULL,
	"priority" integer NOT NULL,
	"min_score" integer DEFAULT 0 NOT NULL,
	"daily_stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"whatsapp_template" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" uuid,
	"prize_key" text NOT NULL,
	"label" text NOT NULL,
	"emoji" text DEFAULT '🎁' NOT NULL,
	"code" text NOT NULL,
	"source" text DEFAULT 'game' NOT NULL,
	"score" integer,
	"whatsapp_message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issued_date" date NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rewards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_played_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_stock_days" ADD CONSTRAINT "prize_stock_days_prize_key_prizes_key_fk" FOREIGN KEY ("prize_key") REFERENCES "public"."prizes"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_player" ON "game_sessions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_date" ON "game_sessions" USING btree ("play_date");--> statement-breakpoint
CREATE INDEX "idx_games_player" ON "games" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_games_play_date" ON "games" USING btree ("play_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_games_player_date" ON "games" USING btree ("player_id","play_date");--> statement-breakpoint
CREATE INDEX "idx_games_score" ON "games" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_players_phone" ON "players" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_date_prize" ON "prize_stock_days" USING btree ("stock_date","prize_key");--> statement-breakpoint
CREATE INDEX "idx_rewards_player" ON "rewards" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_rewards_code" ON "rewards" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_rewards_status" ON "rewards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rewards_issued_date" ON "rewards" USING btree ("issued_date");