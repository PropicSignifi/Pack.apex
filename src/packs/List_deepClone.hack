            else if(funcName == 'deepClone' && nthArg(args, 1) instanceof Boolean && nthArg(args, 2) instanceof Boolean && nthArg(args, 3) instanceof Boolean && nthArg(args, 4) instanceof List<Object>) {
                List<SObject> mList = (List<SObject>)R.toSObjectList.run(nthArg(args, 4));
                return mList.deepClone((Boolean)nthArg(args, 1), (Boolean)nthArg(args, 2), (Boolean)nthArg(args, 3));
            }
