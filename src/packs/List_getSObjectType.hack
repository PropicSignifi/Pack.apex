           else if(funcName == 'getSObjectType' && nthArg(args, 1) instanceof List<Object>) {
                List<SObject> mList = (List<SObject>)R.toSObjectList.run(nthArg(args, 1));
                return mList.getSObjectType();
            }
