            else if(funcName == 'putAll' && nthArg(args, 1) instanceof Map<String, Object> && nthArg(args, 2) instanceof Map<String, Object>) {
                ((Map<String, Object>)nthArg(args, 2)).putAll((Map<String, Object>)nthArg(args, 1));
                return null;
            }
            else if(funcName == 'putAll' && nthArg(args, 1) instanceof List<SObject> && nthArg(args, 2) instanceof Map<String, Object>) {
                ((Map<String, SObject>)R.toSObjectMap.run(nthArg(args, 2))).putAll((List<SObject>)nthArg(args, 1));
                return null;
            }
