            else if(funcName == 'getSObjectType' && nthArg(args, 1) instanceof Map<String, Object>) {
                return ((Map<String, SObject>)R.toSObjectMap.run(nthArg(args, 1))).getSObjectType();
            }
