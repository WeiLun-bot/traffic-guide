'use strict';
module.exports=function readProjectConfig(root=require('node:path').resolve(__dirname,'..')){return require('../tools/presentation-project-store.cjs').read(root).config;};
