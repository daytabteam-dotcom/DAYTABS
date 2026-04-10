#!/usr/bin/env node

import { getB2Client, getB2Bucket } from './src/lib/b2.js';

async function testB2Config() {
  console.log('Testing B2 configuration...');

  try {
    const client = getB2Client();
    const bucket = getB2Bucket();

    console.log('✅ B2 client initialized successfully');
    console.log(`📦 Bucket: ${bucket}`);
    console.log(`🔗 Endpoint: ${process.env.B2_ENDPOINT}`);

    // Test credentials by listing objects (should work even if bucket is empty)
    console.log('🔍 Testing B2 connection...');
    const response = await client.listObjectsV2({
      Bucket: bucket,
      MaxKeys: 1
    });

    console.log('✅ B2 connection successful');
    console.log(`📊 Objects in bucket: ${response.Contents?.length || 0}`);

  } catch (error) {
    console.error('❌ B2 configuration test failed:', error.message);
    console.log('\nRequired environment variables:');
    console.log('- B2_ENDPOINT');
    console.log('- B2_ACCESS_KEY_ID');
    console.log('- B2_SECRET_ACCESS_KEY');
    console.log('- B2_BUCKET_NAME');
    process.exit(1);
  }
}

testB2Config();