CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX parties_org_name_keyset_idx ON parties (organization_id, lower(display_name), id);
--> statement-breakpoint
CREATE INDEX parties_org_updated_keyset_idx ON parties (organization_id, updated_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX parties_name_trgm_idx ON parties USING gin (lower(display_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX parties_legal_name_trgm_idx ON parties USING gin (lower(legal_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX party_identifiers_value_trgm_idx ON party_identifiers USING gin (lower(normalized_value) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX party_contacts_name_trgm_idx ON party_contacts USING gin (lower(display_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX party_contact_channels_value_trgm_idx ON party_contact_channels USING gin (lower(value) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX assets_org_name_keyset_idx ON assets (organization_id, lower(display_name), id);
--> statement-breakpoint
CREATE INDEX assets_org_updated_keyset_idx ON assets (organization_id, updated_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX assets_name_trgm_idx ON assets USING gin (lower(display_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX assets_manufacturer_trgm_idx ON assets USING gin (lower(manufacturer) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX assets_model_trgm_idx ON assets USING gin (lower(model) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX assets_classification_trgm_idx ON assets USING gin (lower(classification) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX asset_identifiers_value_trgm_idx ON asset_identifiers USING gin (lower(normalized_value) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX asset_relationships_location_trgm_idx ON asset_relationships USING gin (lower(location_description) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX organization_sites_name_trgm_idx ON organization_sites USING gin (lower(name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX party_addresses_line1_trgm_idx ON party_addresses USING gin (lower(line_1) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX party_addresses_locality_trgm_idx ON party_addresses USING gin (lower(locality) gin_trgm_ops);
