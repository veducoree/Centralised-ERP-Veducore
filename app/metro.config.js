const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @/* path alias → src/*
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

// Keep default React Native field resolution order so Codegen runs correctly.
// 'react-native' field must come first for New Architecture / Codegen to work.
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
