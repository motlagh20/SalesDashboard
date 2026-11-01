import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAndHydrateItemsJson, serializeItemsJson } from '../src/utils/itemsJsonHelper';

test('itemsJsonHelper test suite', async (t) => {
  const sampleProducts = [
    { id: 'prod-101', name: 'سیمان پرتلند تیپ ۲', unit: 'پاکت', pricePerUnit: 125000, imageUrl: '/img/p1.png' },
    { id: 'prod-102', name: 'گچ سمنان اعلا', unit: 'کیسه', pricePerUnit: 45000, imageUrl: '/img/p2.png' }
  ];

  await t.test('1. Gracefully handles null, undefined, and empty string', () => {
    assert.deepEqual(parseAndHydrateItemsJson(null, sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson(undefined, sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('', sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('   ', sampleProducts), []);
  });

  await t.test('2. Gracefully handles non-JSON tracking codes or random strings without error', () => {
    // Strings that previously crashed JSON.parse
    assert.deepEqual(parseAndHydrateItemsJson('TRK-TEHRAN-9081', sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('TRK-ESFAHAN-6055', sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('TRK-TEH-101', sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('Some plain text notes', sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('12345', sampleProducts), []);
  });

  await t.test('3. Gracefully handles malformed JSON strings starting with [ or {', () => {
    assert.deepEqual(parseAndHydrateItemsJson('[{ broken json', sampleProducts), []);
    assert.deepEqual(parseAndHydrateItemsJson('{ bad: json', sampleProducts), []);
  });

  await t.test('4. Parses and hydrates compact format string', () => {
    const compactStr = JSON.stringify([
      { id: 'prod-101', q: 50 },
      { id: 'prod-102', q: 20, p: 48000 }
    ]);

    const result = parseAndHydrateItemsJson(compactStr, sampleProducts);
    assert.equal(result.length, 2);

    assert.equal(result[0].productId, 'prod-101');
    assert.equal(result[0].productName, 'سیمان پرتلند تیپ ۲');
    assert.equal(result[0].quantity, 50);
    assert.equal(result[0].unit, 'پاکت');
    assert.equal(result[0].pricePerUnit, 125000);
    assert.equal(result[0].imageUrl, '/img/p1.png');

    assert.equal(result[1].productId, 'prod-102');
    assert.equal(result[1].quantity, 20);
    assert.equal(result[1].pricePerUnit, 48000); // Custom override price
  });

  await t.test('5. Parses and hydrates legacy full format string', () => {
    const legacyStr = JSON.stringify([
      { productId: 'prod-custom', productName: 'آجر نسوز', quantity: 1000, unit: 'عدد', pricePerUnit: 3500 }
    ]);

    const result = parseAndHydrateItemsJson(legacyStr, sampleProducts);
    assert.equal(result.length, 1);
    assert.equal(result[0].productId, 'prod-custom');
    assert.equal(result[0].productName, 'آجر نسوز');
    assert.equal(result[0].quantity, 1000);
    assert.equal(result[0].unit, 'عدد');
    assert.equal(result[0].pricePerUnit, 3500);
  });

  await t.test('6. Handles already-parsed array or object directly', () => {
    const parsedArray = [{ id: 'prod-101', q: 10 }];
    const resArray = parseAndHydrateItemsJson(parsedArray, sampleProducts);
    assert.equal(resArray.length, 1);
    assert.equal(resArray[0].productId, 'prod-101');
    assert.equal(resArray[0].quantity, 10);

    const parsedObj = { id: 'prod-102', q: 5 };
    const resObj = parseAndHydrateItemsJson(parsedObj, sampleProducts);
    assert.equal(resObj.length, 1);
    assert.equal(resObj[0].productId, 'prod-102');
    assert.equal(resObj[0].quantity, 5);
  });

  await t.test('7. serializeItemsJson creates compact JSON string', () => {
    const items = [
      { productId: 'prod-101', productName: 'سیمان', quantity: 200, unit: 'پاکت', pricePerUnit: 125000 },
      { id: 'prod-102', q: 50 }
    ];

    const serialized = serializeItemsJson(items);
    assert.ok(typeof serialized === 'string');
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], { id: 'prod-101', q: 200, p: 125000 });
    assert.deepEqual(parsed[1], { id: 'prod-102', q: 50 });
  });

  await t.test('8. serializeItemsJson handles empty or invalid inputs', () => {
    assert.equal(serializeItemsJson([]), '');
    assert.equal(serializeItemsJson(null as any), '');
    assert.equal(serializeItemsJson(undefined as any), '');
  });
});
