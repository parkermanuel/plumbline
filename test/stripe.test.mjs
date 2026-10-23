// Stripe webhook helpers: signature check and turning a checkout into couples.
import { verifySignature, creditFromEvent, PLUMBLINE_LINK } from "../supabase/functions/plumbline-stripe/stripe.js";
import { createHmac } from "crypto";

let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const secret = "whsec_test", raw = JSON.stringify({ hello: 1 }), t = 1_800_000_000;
const sign = (body, ts, s = secret) => `t=${ts},v1=${createHmac("sha256", s).update(`${ts}.${body}`).digest("hex")}`;
ok(await verifySignature(raw, sign(raw, t), secret, t), "accepts a correctly signed event");
ok(!(await verifySignature(raw + " ", sign(raw, t), secret, t)), "rejects a changed body");
ok(!(await verifySignature(raw, sign(raw, t, "whsec_other"), secret, t)), "rejects the wrong secret");
ok(!(await verifySignature(raw, sign(raw, t), secret, t + 600)), "rejects an old event");
ok(!(await verifySignature(raw, null, secret, t)), "rejects a missing header");

const NET = "0b6a7c1e-1111-4222-8333-444455556666";
const ev = (o) => ({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_link: PLUMBLINE_LINK, payment_status: "paid", client_reference_id: NET, amount_subtotal: 29700, amount_total: 19899, ...o } } });
const c = creditFromEvent(ev({}));
ok(c && c.couples === 3 && c.network === NET && c.amountPaid === 19899, "three couples with the BETA code still count as three");
ok(creditFromEvent(ev({ amount_subtotal: 9900, amount_total: 0, payment_status: "no_payment_required" }))?.couples === 1, "FRMG (100% off) still adds the couple");
ok(creditFromEvent(ev({ client_reference_id: null })) === null, "ignored without a network");
ok(creditFromEvent(ev({ payment_link: "plink_other" })) === null, "ignored for other products");
ok(creditFromEvent(ev({ payment_status: "unpaid" })) === null, "ignored until paid");
ok(creditFromEvent({ type: "invoice.paid" }) === null, "ignores other events");
process.exit(failed ? 1 : 0);
