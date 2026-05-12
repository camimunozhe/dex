-- Atomic transfer of trade cards between the proposer and receiver of a meetup.
-- Cards with side='receiver' move to the proposer, and vice versa.
-- folder_id is reset since folders belong to the original owner.
-- Run once in Supabase SQL editor.

CREATE OR REPLACE FUNCTION transfer_trade_cards(p_meetup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposer uuid;
  v_receiver uuid;
BEGIN
  SELECT proposer_id, receiver_id
    INTO v_proposer, v_receiver
    FROM meetups
    WHERE id = p_meetup_id;

  IF v_proposer IS NULL THEN
    RAISE EXCEPTION 'Meetup % not found', p_meetup_id;
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_proposer AND auth.uid() <> v_receiver) THEN
    RAISE EXCEPTION 'Only meetup participants can transfer cards';
  END IF;

  UPDATE cards_collection
    SET user_id = v_proposer,
        folder_id = NULL,
        is_published = false,
        is_for_trade = false,
        is_for_sale = false,
        price_reference = NULL
    WHERE id IN (
      SELECT card_id FROM meetup_cards
      WHERE meetup_id = p_meetup_id AND side = 'receiver'
    );

  UPDATE cards_collection
    SET user_id = v_receiver,
        folder_id = NULL,
        is_for_trade = false,
        is_for_sale = false,
        price_reference = NULL
    WHERE id IN (
      SELECT card_id FROM meetup_cards
      WHERE meetup_id = p_meetup_id AND side = 'proposer'
    );
END;
$$;

REVOKE ALL ON FUNCTION transfer_trade_cards(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transfer_trade_cards(uuid) TO authenticated;
