#!/usr/bin/env node
if (process.env.NODE_ENV == null) process.env.NODE_ENV = 'production'
/** 默认启动整体服务；部署入口集中在 deploy/node。 @author yahyaoo */
require('./deploy/node/start.cjs')
