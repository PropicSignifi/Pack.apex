            else if(funcName == 'joinFn' && nthArg(args, 2) instanceof String) {
                Object target = nthArg(args, 1);
                if(target instanceof List<Object>) {
                    return String.join((List<Object>)target, (String)nthArg(args, 2));
                }
                else if(target instanceof Iterable<Object>) {
                    return String.join((Iterable<Object>)target, (String)nthArg(args, 2));
                }

                return null;
            }
