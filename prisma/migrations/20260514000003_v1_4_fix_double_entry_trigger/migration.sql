-- Fix double-entry trigger to use direction-aware math
-- Previous version used raw SUM which always produced non-zero net
-- because amounts are stored as positive integers
-- Direction column must determine the sign not the amount itself
CREATE OR REPLACE FUNCTION fn_enforce_double_entry()
RETURNS TRIGGER AS $$
DECLARE net_val BIGINT;
BEGIN
  SELECT SUM(
    CASE WHEN direction = 'CREDIT' THEN amount_kobo
         ELSE -amount_kobo END
  ) INTO net_val
  FROM journal_entries
  WHERE transaction_id = NEW.transaction_id;

  IF net_val != 0 THEN
    RAISE EXCEPTION
      'Double-entry violation for tx %: net % kobo',
      NEW.transaction_id, net_val;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql