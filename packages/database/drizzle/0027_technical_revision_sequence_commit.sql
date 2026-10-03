CREATE OR REPLACE FUNCTION ardenfold_execution_revision_sequence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_count bigint;
        final_next_revision_number integer;
BEGIN
    SELECT next_revision_number INTO final_next_revision_number
    FROM technical_executions
    WHERE organization_id = NEW.organization_id AND id = NEW.id;
    SELECT count(*) INTO revision_count FROM execution_revisions
    WHERE organization_id = NEW.organization_id AND execution_id = NEW.id;
    IF final_next_revision_number IS NULL
       OR revision_count <> final_next_revision_number - 1 THEN
        RAISE EXCEPTION 'Execution revision sequence has a gap' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
