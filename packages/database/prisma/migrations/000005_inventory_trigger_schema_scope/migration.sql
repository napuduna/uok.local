CREATE OR REPLACE FUNCTION enforce_inventory_movement_warehouse()
RETURNS TRIGGER AS $$
DECLARE
    lot_warehouse_id UUID;
BEGIN
    EXECUTE format(
        'SELECT "warehouseId" FROM %I."Lot" WHERE "id" = $1',
        TG_TABLE_SCHEMA
    )
    INTO lot_warehouse_id
    USING NEW."lotId";

    IF lot_warehouse_id IS DISTINCT FROM NEW."warehouseId" THEN
        RAISE EXCEPTION 'inventory movement warehouse must match lot warehouse';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
