#!/usr/bin/env node
import { main } from '../lib/cli.mjs';

process.exitCode = main(process.argv.slice(2));
